// Kept separate from the versioned app cache so an update cannot discard a share.
export const shareCacheName = base => `folio-incoming:${base}`;
const shareURL = (base, id) => new URL(`${base}__shared__/${id}`, location.origin).href;

export async function readShare(base, id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const cache = await caches.open(shareCacheName(base));
  const response = await cache.match(shareURL(base, id));
  return response ? response.json() : null;
}

export async function removeShare(base, id) {
  const cache = await caches.open(shareCacheName(base));
  await cache.delete(shareURL(base, id));
}

// This self-contained function is embedded in the production service worker.
// Android sends a multipart navigation POST; GitHub Pages never receives its body.
export async function receiveShare(request, { base, origin, cacheName }) {
  const redirect = params => Response.redirect(new URL(`${base}index.html?${new URLSearchParams(params)}`, origin).href, 303);
  let form;
  try { form = await request.formData(); }
  catch { return redirect({ 'share-error': 'invalid' }); }

  const files = [], errors = [];
  const maximum = 2 * 1024 * 1024;
  const incoming = form.getAll('files');
  let total = 0;
  if (incoming.length > 20) errors.push('Only the first 20 files were received. Share the remaining files separately.');
  for (const file of incoming.slice(0, 20)) {
    const name = typeof file === 'string' ? 'Shared file' : file.name;
    try {
      if (typeof file === 'string' || !/\.(md|markdown|mdown|txt)$/i.test(name)) throw new Error('Choose a .md, .markdown, .mdown, or .txt file.');
      if (file.size > maximum) throw new Error('The 2 MB file limit was exceeded.');
      if (total + file.size > 20 * 1024 * 1024) throw new Error('Share up to 20 MB at a time.');
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('Save this file as UTF-8 text, then share it again.'); }
      if (content.includes('\0')) throw new Error('This file contains binary data. Share a Markdown text file.');
      if (!content.trim()) throw new Error('This file is empty.');
      total += file.size;
      files.push({ name, content });
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }

  // Some apps share Markdown as text instead of attaching a file.
  if (!incoming.length) {
    const text = form.get('text');
    const title = form.get('title');
    if (typeof text !== 'string' || !text.trim()) errors.push('No Markdown arrived. In your file manager, select the file and choose Share → Folio.');
    else if (new Blob([text]).size > maximum) errors.push('The shared text exceeds the 2 MB document limit.');
    else files.push({ name: 'shared-note.md', content: text, title: typeof title === 'string' ? title.trim().slice(0, 200) : '' });
  }

  const id = crypto.randomUUID();
  try {
    const cache = await caches.open(cacheName);
    // Abandoned handoffs expire after a day; current and concurrent shares stay separate.
    for (const key of await cache.keys()) {
      const item = await cache.match(key);
      const created = Number(item?.headers.get('X-Folio-Created'));
      if (created && Date.now() - created > 86400000) await cache.delete(key);
    }
    await cache.put(new URL(`${base}__shared__/${id}`, origin).href, new Response(JSON.stringify({ id, files, errors }), {
      headers: { 'Content-Type': 'application/json', 'X-Folio-Created': String(Date.now()) },
    }));
  } catch { return redirect({ 'share-error': 'storage' }); }
  return redirect({ share: id });
}
