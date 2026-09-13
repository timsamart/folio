// Run against a production preview in a fresh Playwright CLI session:
// playwright-cli -s=share open http://127.0.0.1:5174/folio/
// playwright-cli -s=share run-code --filename=scripts/check-share-browser.js
async page => {
  const { base, origin } = await page.evaluate(() => ({ base: location.pathname.replace(/index\.html$/, ''), origin: location.origin }));
  const checks = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
  const waitReady = async () => {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.waitForSelector('#reading-content h1');
  };
  const readLibrary = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('folio-reader', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('documents').objectStore('documents').getAll();
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }));
  const send = async (files = [], text = '', title = '') => {
    const response = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === `${origin}${base}share-target`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.evaluate(({ files, text, title, base }) => {
        const form = document.createElement('form');
        form.action = `${base}share-target`; form.method = 'POST'; form.enctype = 'multipart/form-data';
        if (files.length) {
          const input = document.createElement('input'); input.type = 'file'; input.name = 'files'; input.multiple = true;
          const transfer = new DataTransfer();
          for (const file of files) transfer.items.add(new File([file.content.repeat(file.repeat || 1)], file.name, { type: file.type || 'text/markdown' }));
          input.files = transfer.files; form.append(input);
        }
        for (const [name, value] of Object.entries({ text, title })) {
          const input = document.createElement('input'); input.name = name; input.value = value; form.append(input);
        }
        document.body.append(form); form.submit();
      }, { files, text, title, base }),
    ]);
    const received = await response;
    check(received.status() === 303 && received.fromServiceWorker(), 'Share POST handled locally by service worker');
    await waitReady();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('share'));
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await waitReady();
  const initialCount = (await readLibrary()).length;
  const markdown = '# Shared from Android\n\nA little math: $x^2$.\n\n```js\nconst ready = true;\n```\n\n```mermaid\ngraph LR\n  A[Shared file] --> B[Reading room]\n```';
  await send([{ name: 'android.MD', content: markdown, type: 'application/octet-stream' }]);
  await page.waitForSelector('.diagram-canvas svg');
  check(await page.locator('#reading-content h1').textContent() === 'Shared from Android', 'Generic MIME and uppercase .MD open directly');
  check(await page.locator('.katex').count() === 1 && await page.locator('.hljs-keyword').count() > 0, 'Shared Markdown renders math, code, and Mermaid');
  check((await readLibrary()).length === initialCount + 1, 'Received document persisted');
  const firstURL = page.url();
  await page.reload(); await waitReady();
  check((await readLibrary()).length === initialCount + 1 && page.url() === firstURL, 'Reload does not import the same share again');
  check(await page.evaluate(async base => (await (await caches.open(`folio-incoming:${base}`)).keys()).length, base) === 0, 'Pending payload removed only after import');

  await page.context().setOffline(true);
  try {
    await send([
      { name: 'one.markdown', content: '# First offline file\n\nOne.' },
      { name: 'two.mdown', content: '# Second offline file\n\nTwo.', type: 'text/plain' },
    ]);
    check(await page.locator('#reading-content h1').textContent() === 'Second offline file', 'Multiple shared files open while offline');
    await page.reload(); await waitReady();
    check((await readLibrary()).length === initialCount + 3, 'Offline shares survive reload');
  } finally { await page.context().setOffline(false); }

  await send([], '# A shared note\n\nText sent by another app.', 'A useful note');
  check((await readLibrary()).some(doc => doc.title === 'A useful note' && doc.content.includes('A shared note')), 'Markdown shared as text is saved');

  await send([
    { name: 'valid.txt', content: '# Valid in a mixed share' },
    { name: '<img src=x onerror=alert(1)>.pdf', content: 'Not Markdown', type: 'application/pdf' },
    { name: 'too-large.md', content: 'x', repeat: 2 * 1024 * 1024 + 1 },
    { name: 'empty.md', content: '  ' },
    { name: 'binary.md', content: '\0\0\0' },
  ]);
  await page.waitForSelector('#sheet[open]');
  const feedback = await page.locator('#sheet-content').textContent();
  check(feedback.includes('1 document saved') && feedback.includes('2 MB') && feedback.includes('empty') && feedback.includes('binary'), 'Invalid files explained while valid file is imported');
  check(await page.locator('#sheet-content img').count() === 0, 'Shared filenames cannot inject HTML');
  check((await readLibrary()).length === initialCount + 5, 'Rejected files do not enter library');

  // Leave two handoffs pending without launching their reader pages, then open a
  // fresh window while offline. Also simulate a previously committed first file.
  const queued = await page.evaluate(async base => {
    const queue = async (name, content) => {
      const form = new FormData(); form.append('files', new File([content], name, { type: 'text/markdown' }));
      const response = await fetch(`${base}share-target`, { method: 'POST', body: form });
      return response.url;
    };
    return Promise.all([queue('cold.md', '# Cold launch'), queue('another.md', '# Another pending share')]);
  }, base);
  const sharedId = await page.evaluate(url => new URL(url).searchParams.get('share'), queued[0]);
  await page.evaluate(async sharedId => new Promise((resolve, reject) => {
    const request = indexedDB.open('folio-reader', 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('documents', 'readwrite');
      tx.objectStore('documents').put({ id: `share-${sharedId}-0`, name: 'cold.md', title: 'Cold launch', content: '# Cold launch', bookmarked: true, progress: .25, addedAt: Date.now() });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), sharedId);
  const context = page.context();
  const formerPage = page;
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await formerPage.close();
  await context.setOffline(true);
  try {
    await page.goto(queued[0]); await waitReady();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('share'));
    check(await page.locator('#reading-content h1').textContent() === 'Cold launch', 'Fresh window receives a pending share offline');
    const docs = await readLibrary();
    check(docs.filter(doc => doc.id === `share-${sharedId}-0`).length === 1 && docs.find(doc => doc.id === `share-${sharedId}-0`).bookmarked, 'Interrupted import resumes without duplication or losing bookmarks');
    check(await page.evaluate(async base => (await (await caches.open(`folio-incoming:${base}`)).keys()).length, base) === 1, 'Concurrent share remains available');
    await page.goto(queued[1]); await waitReady();
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('share'));
    check(await page.locator('#reading-content h1').textContent() === 'Another pending share', 'Second pending share opens independently');
  } finally { await context.setOffline(false); }

  const retryURL = await page.evaluate(async base => {
    const form = new FormData(); form.append('files', new File(['# Retry after storage failure'], 'retry.md', { type: 'text/markdown' }));
    return (await fetch(`${base}share-target`, { method: 'POST', body: form })).url;
  }, base);
  const failingPage = await context.newPage();
  await failingPage.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, ...args) {
      if (this.name === 'documents' && value?.name === 'retry.md') throw new DOMException('Test storage failure', 'QuotaExceededError');
      return put.call(this, value, ...args);
    };
  });
  await failingPage.goto(retryURL);
  await failingPage.getByRole('button', { name: 'Try receiving again' }).waitFor();
  check(await failingPage.evaluate(() => new URL(location.href).searchParams.has('share')), 'Storage failure keeps a retryable share URL');
  check(await page.evaluate(async base => (await (await caches.open(`folio-incoming:${base}`)).keys()).length, base) === 1, 'Storage failure preserves the original shared payload');
  await failingPage.close();
  await page.goto(retryURL); await waitReady();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has('share'));
  check(await page.locator('#reading-content h1').textContent() === 'Retry after storage failure', 'Share imports successfully after storage becomes available');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile reader has no page overflow');
  check(errors.length === 0, `No page errors: ${errors.join(', ')}`);
  return { passed: checks.length, checks, finalURL: page.url() };
}
