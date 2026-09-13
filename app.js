import './style.css';
import { createIcons, BookOpen, Search, Bookmark, Plus, Library, Info, List, Type, Scan, ArrowUpRight, X, Minus, Minimize, FilePlus2, FileText, Ellipsis, Download, Code, Trash2, Upload, Check, Monitor, WifiOff } from 'lucide';
import { samples } from './samples.js';
import { readDocuments, saveDocument, deleteDocument, readPreferences, savePreferences } from './storage.js';
import { escapeHTML as esc, renderDocument, renderDiagrams, titleFrom } from './renderer.js';
import { readShare, removeShare } from './share-target.js';

const icons = { BookOpen, Search, Bookmark, Plus, Library, Info, List, Type, Scan, ArrowUpRight, X, Minus, Minimize, FilePlus2, FileText, Ellipsis, Download, Code, Trash2, Upload, Check, Monitor, WifiOff };
const refreshIcons = () => createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
const icon = name => `<i data-lucide="${name}"></i>`;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const content = $('#reading-content');
const sheet = $('#sheet');
const sheetContent = $('#sheet-content');
const diagramDialog = $('#diagram-dialog');
const savedPreferences = readPreferences() || {};
const prefs = {
  theme: ['light', 'sepia', 'dark', 'system'].includes(savedPreferences.theme) ? savedPreferences.theme : 'light',
  font: ['serif', 'sans', 'mono'].includes(savedPreferences.font) ? savedPreferences.font : 'serif',
  size: Math.min(26, Math.max(16, Number(savedPreferences.size) || (matchMedia('(max-width:700px)').matches ? 18 : 19))),
  leading: Math.min(2.2, Math.max(1.4, Number(savedPreferences.leading) || 1.85)),
  width: ['comfortable', 'wide'].includes(savedPreferences.width) ? savedPreferences.width : 'comfortable',
  current: savedPreferences.current || 'welcome',
  initialized: !!savedPreferences.initialized,
};
let documents = [], current = null, headings = [], filter = 'all', filterText = '';
let toastTimeout, scrollTimer, renderVersion = 0, restoring = false, pendingInstall = null;
let searchTargets = [], diagramSource = '', diagramZoom = 1, diagramWidth = 800;
let offlineReady = false, storageAvailable = true, updateAvailable = false;
let draft = { title: '', markdown: '' };
const minutes = doc => Math.max(1, Math.ceil(doc.content.trim().split(/\s+/).length / 220));
const motion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

function toast(message) {
  const node = $('#toast');
  (diagramDialog.open ? diagramDialog : sheet.open ? sheet : document.body).append(node);
  node.textContent = message;
  node.classList.add('visible');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => node.classList.remove('visible'), 3600);
}

function rememberPreferences() {
  if (!savePreferences(prefs)) $('#save-status').textContent = 'Preferences could not be saved on this device';
}

function activeTheme() {
  return prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme;
}

function applyAppearance(redrawDiagrams = false) {
  document.documentElement.dataset.theme = activeTheme();
  const style = document.documentElement.style;
  style.setProperty('--reading-size', `${prefs.size}px`);
  style.setProperty('--reading-leading', prefs.leading);
  style.setProperty('--reading-width', prefs.width === 'wide' ? '850px' : '680px');
  style.setProperty('--reading-font', { serif: "'Source Serif', Georgia, serif", sans: "'DM Sans', sans-serif", mono: "'JetBrains Mono', monospace" }[prefs.font]);
  $('meta[name="theme-color"]').content = { light: '#f4f6fa', dark: '#121b28', sepia: '#eeebe2' }[activeTheme()];
  if (redrawDiagrams) renderDiagrams(content, activeTheme()).catch(() => toast('Diagrams are unavailable. Reload when connected to finish loading them.'));
}

async function persist(doc) {
  try { await saveDocument({ ...doc }); storageAvailable = true; $('#save-status').textContent = 'Your place is saved automatically'; return true; }
  catch { storageAvailable = false; $('#save-status').textContent = 'Not saved · Download your document to keep it'; return false; }
}

function libraryMarkup() {
  const visible = documents.filter(doc => (filter !== 'bookmarked' || doc.bookmarked) && `${doc.title} ${doc.name}`.toLowerCase().includes(filterText.toLowerCase()));
  if (!visible.length) return `<p class="empty-state">${filterText ? 'No documents match. Try another title.' : filter === 'bookmarked' ? 'Bookmark a document to keep it close.' : 'Your next good read starts here. Add a Markdown document.'}</p>`;
  return visible.map(doc => `<button class="document-item ${doc.id === current?.id ? 'active' : ''}" data-document="${esc(doc.id)}" ${doc.id === current?.id ? 'aria-current="page"' : ''}>
    <span class="document-icon">${icon(doc.id === 'async' ? 'code' : 'file-text')}</span>
    <span class="document-info"><strong>${esc(doc.title)}</strong><small>${minutes(doc)} min read <span aria-hidden="true">·</span> ${esc(doc.collection || 'Your documents')}</small>${doc.id === current?.id ? `<span class="tiny-progress" aria-hidden="true"><span style="width:${Math.round((doc.progress || 0) * 100)}%"></span></span>` : ''}</span>
    ${doc.bookmarked ? `<span class="saved-dot">${icon('bookmark')}</span>` : ''}
  </button>`).join('');
}

function updateLibrary() {
  $('#desktop-library').innerHTML = libraryMarkup();
  const mobile = $('#sheet-library'); if (mobile) mobile.innerHTML = libraryMarkup();
  $$('.document-count').forEach(el => { el.textContent = documents.length; });
  $$('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  refreshIcons();
}

function outlineMarkup() {
  return headings.length ? headings.map(h => `<a href="#${esc(h.id)}" data-heading="${esc(h.id)}" data-level="${h.tagName.slice(1)}">${esc(h.textContent)}</a>`).join('') : '<p class="empty-state">Sections will appear here when the document has headings.</p>';
}

function updateBookmark() {
  $$('.bookmark-control').forEach(button => {
    button.setAttribute('aria-pressed', String(!!current?.bookmarked));
    button.setAttribute('aria-label', current?.bookmarked ? 'Remove bookmark' : 'Bookmark document');
    button.title = current?.bookmarked ? 'Remove bookmark' : 'Bookmark document';
  });
}

function updateProgress(save = true) {
  if (!current || restoring) return;
  const top = content.getBoundingClientRect().top + window.scrollY - 120;
  const bottom = content.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 80;
  const progress = bottom <= top ? 1 : Math.min(1, Math.max(0, (window.scrollY - top) / (bottom - top)));
  current.progress = progress;
  current.scrollY = window.scrollY;
  current.fragment = location.hash;
  const percent = Math.round(progress * 100);
  $('#reading-progress-bar').style.width = `${percent}%`;
  $('#ring-progress').style.strokeDashoffset = 100.53 * (1 - progress);
  $('#progress-label').textContent = percent < 2 ? 'Just beginning' : percent >= 99 ? 'A good read' : `${percent}% through`;
  $('#remaining-label').textContent = percent >= 99 ? 'You reached the end' : `${Math.max(1, Math.ceil(minutes(current) * (1 - progress)))} min remaining`;
  const active = [...headings].reverse().find(h => h.getBoundingClientRect().top < 185) || headings[0];
  $$('.outline-list [data-heading]').forEach(link => { const on = link.dataset.heading === active?.id; link.classList.toggle('active', on); if (on) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  if (save) { clearTimeout(scrollTimer); const doc = { ...current }; scrollTimer = setTimeout(() => persist(doc), 450); }
}

async function openDocument(id, navigation = true) {
  const doc = documents.find(item => item.id === id);
  if (!doc) return;
  clearTimeout(scrollTimer);
  if (current && current.id !== id) void persist(current);
  current = doc;
  const version = ++renderVersion;
  restoring = true;
  const position = Math.max(0, Number(doc.scrollY) || 0);
  closeSheet();
  if (diagramDialog.open) diagramDialog.close();
  $('#current-filename').textContent = doc.name;
  $('#collection-label').textContent = (doc.collection || 'Your documents').toUpperCase();
  $('#reading-time').textContent = `${minutes(doc)} MIN READ`;
  document.title = `${doc.title} — Folio`;
  $('#reading-main').hidden = false;
  $('.outline-sidebar').style.visibility = '';
  headings = renderDocument(content, doc.content, doc.title);
  $('#desktop-outline').innerHTML = outlineMarkup();
  updateLibrary(); updateBookmark();
  prefs.current = doc.id; rememberPreferences();
  if (navigation) {
    const url = new URL(location.href); url.searchParams.set('doc', doc.id); url.hash = '';
    if (url.href !== location.href) history.pushState({ document: id }, '', url);
  }
  window.scrollTo({ top: position, behavior: 'instant' });
  try { await renderDiagrams(content, activeTheme()); }
  catch { toast('A renderer could not load. Reconnect and reload to try again.'); }
  if (version !== renderVersion) return;
  await document.fonts.ready;
  if (version !== renderVersion) return;
  window.scrollTo({ top: position, behavior: 'instant' });
  restoring = false; updateProgress(false);
}

function closeSheet() {
  if ($('#toast').parentElement === sheet) document.body.append($('#toast'));
  if (sheet.open) sheet.close();
}

function showSheet(title, html, className = '') {
  if (sheet.open) closeSheet();
  $('#sheet-title').textContent = title;
  sheetContent.className = className;
  sheetContent.innerHTML = html;
  sheet.showModal();
  sheetContent.scrollTop = 0;
  refreshIcons();
}

function showLibrary() {
  showSheet('Your library', `<label class="library-search">${icon('search')}<input id="mobile-library-filter" name="mobile-library-search" type="search" value="${esc(filterText)}" placeholder="Find a document…" aria-label="Find a document" autocomplete="off" /></label><div class="library-tabs" role="group" aria-label="Filter library"><button data-filter="all" aria-pressed="${filter === 'all'}">All documents</button><button data-filter="bookmarked" aria-pressed="${filter === 'bookmarked'}">${icon('bookmark')}Saved</button></div><div id="sheet-library" class="document-list sheet-library">${libraryMarkup()}</div><button class="primary-button" data-action="import">${icon('plus')}Add document</button><p class="field-note">${offlineReady ? 'Ready to read offline.' : 'Documents are stored on this device.'} <button class="text-button" data-action="about">About your library</button></p>`);
}

function showImport() {
  showSheet('Something worth reading', `<p class="sheet-description">Bring your notes, essays, and ideas. Open a Markdown file or paste a new page.</p><button class="primary-button" data-action="choose-files">${icon('upload')}Open Markdown files</button><p class="field-note">.md, .markdown, .mdown, or .txt · Up to 2 MB each</p><div class="form-divider">or paste your Markdown</div><form id="paste-form"><label class="field-label" for="document-title">Title <span class="field-note">(optional)</span></label><input class="field-input" id="document-title" name="title" placeholder="An idea worth keeping…" autocomplete="off" /><label class="field-label" for="markdown-input">Markdown</label><textarea class="field-input markdown-input" id="markdown-input" name="markdown" placeholder="# A new page…" required spellcheck="false"></textarea><p id="import-error" class="error-message" role="alert"></p><button class="secondary-button" type="submit">Add to your library</button></form><p class="field-note">Saved in this browser on this device. External images load only when you choose.</p>`);
  $('#document-title').value = draft.title;
  $('#markdown-input').value = draft.markdown;
  sheetContent.insertAdjacentHTML('beforeend', '<button class="text-button" data-action="share-help">Open from another app</button>');
}

function showShareHelp() {
  showSheet('From your files to Folio', `<p class="sheet-description">On Android, send a Markdown file straight to your reading room.</p><ol class="sheet-description"><li>Open Folio in Chrome and choose <strong>Install app</strong>.</li><li>In your file manager, select a Markdown file and tap <strong>Share</strong>.</li><li>Choose <strong>Folio</strong>. Your document is saved and opened for reading.</li></ol><p class="field-note">Look in the Share menu. Android’s separate “Open with” picker is not supported by this web app.</p>${pendingInstall ? '<button class="primary-button" data-action="install">Install Folio</button>' : ''}<h3>Folio missing from Share?</h3><p class="sheet-description">An older installation may still have the previous app registration. Open Folio online and apply any reader update. If it is still missing, back up your library, uninstall Folio, then install it again from Chrome. Restore your backup if needed.</p><button class="secondary-button" data-action="export-library">Back up your library</button><p class="field-note">Choose the app installation, rather than a home-screen shortcut. Sharing also works offline once the reader is ready. Folio 1.1.0</p>`);
}

function showAppearance() {
  showSheet('Make yourself comfortable', `<fieldset class="setting-group"><legend>PAGE COLOR</legend><div class="theme-options">${['light', 'sepia', 'dark', 'system'].map(theme => `<button class="theme-option" data-theme="${theme}" aria-pressed="${prefs.theme === theme}"><span>Aa</span>${{ light: 'Daylight', sepia: 'Paper', dark: 'Night', system: 'System' }[theme]}</button>`).join('')}</div></fieldset><fieldset class="setting-group"><legend>TYPEFACE</legend><div class="segmented">${['serif', 'sans', 'mono'].map(font => `<button data-font="${font}" aria-pressed="${prefs.font === font}" style="font-family:${{ serif: 'Source Serif', sans: 'DM Sans', mono: 'JetBrains Mono' }[font]}">${{ serif: 'Literary', sans: 'Modern', mono: 'Mono' }[font]}</button>`).join('')}</div></fieldset><div class="setting-group"><label class="range-label" for="font-size">Text size<output id="font-size-value">${prefs.size} px</output></label><input id="font-size" name="font-size" type="range" min="16" max="26" step="1" value="${prefs.size}" /></div><div class="setting-group"><label class="range-label" for="line-height">Line spacing<output id="line-height-value">${prefs.leading.toFixed(2)}</output></label><input id="line-height" name="line-height" type="range" min="1.4" max="2.2" step="0.05" value="${prefs.leading}" /></div><fieldset class="setting-group"><legend>READING WIDTH</legend><div class="segmented"><button data-width="comfortable" aria-pressed="${prefs.width === 'comfortable'}">Comfortable</button><button data-width="wide" aria-pressed="${prefs.width === 'wide'}">Wide</button></div></fieldset><div class="appearance-preview"><span>YOUR READING RHYTHM</span><p>Good ideas deserve a little room. Take a breath, turn the page, and follow your curiosity.</p></div>`);
}

function showSearch() {
  if (!current) return showLibrary();
  showSheet('Find a passage', `<label class="sr-only" for="document-search">Search in this document</label><input id="document-search" name="document-search" class="field-input" type="search" placeholder="A word, a phrase, an idea…" autocomplete="off" /><p class="search-summary" id="search-summary" role="status">Search the text and code in “${esc(current.title)}”.</p><div class="search-results" id="search-results"></div>`);
  if (matchMedia('(min-width:701px)').matches) $('#document-search').focus();
}

function findPassages(query) {
  const needle = query.trim().toLocaleLowerCase();
  searchTargets = [];
  if (!needle) { $('#search-results').innerHTML = ''; $('#search-summary').textContent = 'Type a word or phrase to find it on this page.'; return; }
  const blocks = [...content.querySelectorAll('h1,h2,h3,h4,p,li,pre,td,th')].filter(el => !el.closest('.diagram-block') && !el.querySelector('p,li,pre,td,th'));
  const results = [];
  for (const el of blocks) {
    const text = el.textContent;
    const index = text.toLocaleLowerCase().indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 45), end = Math.min(text.length, index + needle.length + 90);
    const context = `${start ? '…' : ''}${esc(text.slice(start, index))}<mark>${esc(text.slice(index, index + needle.length))}</mark>${esc(text.slice(index + needle.length, end))}${end < text.length ? '…' : ''}`;
    results.push(`<button class="search-result" data-search-result="${searchTargets.length}"><small>PASSAGE ${searchTargets.length + 1}</small>${context}</button>`);
    searchTargets.push(el);
    if (searchTargets.length >= 60) break;
  }
  $('#search-summary').textContent = results.length ? `${results.length}${results.length === 60 ? '+' : ''} matching passage${results.length === 1 ? '' : 's'}` : `No matches for “${query}”. Try a shorter phrase.`;
  $('#search-results').innerHTML = results.join('');
}

function showMore() {
  showSheet('Your document', `<p class="sheet-description">${esc(current?.title || 'Your library')}</p><div class="menu-actions">${current ? `<button data-action="download">${icon('download')}Download Markdown<small>Original file</small></button><button data-action="source">${icon('code')}View source<small>Markdown</small></button><button data-action="bookmark">${icon('bookmark')}${current.bookmarked ? 'Remove bookmark' : 'Bookmark document'}</button><button data-action="focus">${icon('scan')}${document.body.classList.contains('focus') ? 'Exit focus mode' : 'Focus mode'}<small>F</small></button><hr />` : ''}<button data-action="import">${icon('plus')}Add document</button><button data-action="export-library">${icon('download')}Back up library<small>JSON</small></button><button data-action="restore-library">${icon('upload')}Restore library<small>JSON backup</small></button><button data-action="about">${icon('info')}Offline & installation</button>${current ? `<hr /><button class="danger" data-action="remove">${icon('trash-2')}Remove from library</button>` : ''}</div>`);
}

function showAbout() {
  showSheet('Yours, wherever you read', `<p class="sheet-description">Your documents and reading position are stored in this browser on this device. There is no account or cloud sync. Keep a backup before clearing browser data.</p><div class="appearance-preview"><span>OFFLINE READING</span><p style="font-size:16px">${offlineReady ? 'Your reader is ready offline, including diagrams, code, and mathematics.' : import.meta.env.DEV ? 'Offline installation is available in the production build. This is a development preview.' : 'Preparing offline reading. Keep this page open while the app and renderers finish downloading.'}</p></div><h3>Keep Folio close</h3><p class="sheet-description">On iPhone or iPad, open Folio in Safari, tap Share, then Add to Home Screen. On Android or desktop, use your browser’s Install app option.</p>${pendingInstall ? '<button class="primary-button" data-action="install">Install Folio</button>' : ''}<button class="secondary-button" data-action="export-library">Back up your library</button><p class="field-note">Browser storage can be cleared or evicted by your device. A backup keeps a separate copy of every document. External images require a connection and are loaded only on request.</p>`);
  if (updateAvailable) {
    const button = document.createElement('button'); button.className = 'primary-button'; button.dataset.action = 'update-app'; button.textContent = 'Reader update available'; sheetContent.prepend(button);
  }
  sheetContent.insertAdjacentHTML('beforeend', '<button class="secondary-button" data-action="share-help">Open from another app</button><p class="field-note">Folio 1.1.0</p>');
}

function download(data, name, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text, button) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
    (diagramDialog.open ? diagramDialog : sheet.open ? sheet : document.body).append(textarea); textarea.select();
    const success = document.execCommand('copy'); textarea.remove();
    if (!success) { toast('Copy is unavailable. Select the source text and copy it manually.'); return; }
  }
  if (button) { const before = button.textContent; button.textContent = 'Copied'; setTimeout(() => { if (button.isConnected) button.textContent = before; }, 1500); }
  toast('Copied to clipboard');
}

async function addDocument(raw, name, title, id = crypto.randomUUID()) {
  const existing = documents.find(doc => doc.id === id);
  if (existing) return existing;
  if (!raw.trim()) throw new Error('Add some Markdown before saving this page.');
  if (new Blob([raw]).size > 2 * 1024 * 1024) throw new Error('This document is larger than 2 MB. Split it into smaller Markdown files.');
  const doc = { id, name: name || 'untitled.md', title: title?.trim() || titleFrom(raw, name), content: raw, collection: 'Your documents', progress: 0, scrollY: 0, bookmarked: false, addedAt: Date.now() };
  if (!await persist(doc)) throw new Error('The document could not be saved. Free some browser storage, then try again. Your original text is still here.');
  documents.unshift(doc); prefs.initialized = true; rememberPreferences(); return doc;
}

async function consumeIncomingShare() {
  const url = new URL(location.href);
  const id = url.searchParams.get('share');
  const failure = url.searchParams.get('share-error');
  if (!id && !failure) return null;
  let latest, count = 0, retry = false;
  const errors = [];
  if (failure) errors.push(failure === 'storage'
    ? 'There was not enough browser storage to receive this share. Free some space, then share the original file again.'
    : 'The share could not be read. Select the Markdown file and share it again.');
  else {
    try {
      const incoming = await readShare(import.meta.env.BASE_URL, id);
      if (!incoming) errors.push('This share is no longer waiting. If it is not in your library, share the original file again.');
      else {
        errors.push(...incoming.errors);
        for (const [index, file] of incoming.files.entries()) {
          try {
            // Stable IDs make an interrupted import safe to retry without duplicates.
            latest = await addDocument(file.content, file.name, file.title, `share-${id}-${index}`);
            count++;
          } catch {
            retry = true;
            errors.push(`${file.name}: Could not save this document. Free some browser storage, then try again.`);
          }
        }
        if (!retry) await removeShare(import.meta.env.BASE_URL, id);
      }
    } catch {
      retry = true;
      errors.push('Your shared files could not be opened. Try again after browser storage is available.');
    }
  }
  if (!retry) { url.searchParams.delete('share'); url.searchParams.delete('share-error'); }
  if (latest) url.searchParams.set('doc', latest.id);
  history.replaceState({}, '', url);
  return { latest, count, errors, retry };
}

function showShareResult(result) {
  if (result.errors.length) showSheet('About your shared files', `<p class="sheet-description">${result.count} document${result.count === 1 ? '' : 's'} saved to your library.</p><ul>${result.errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul>${result.retry ? '<button class="primary-button" data-action="retry-share">Try receiving again</button>' : '<button class="primary-button" data-action="import">Open another file</button>'}`);
  else if (result.count) toast(`${result.count} shared document${result.count === 1 ? '' : 's'} added to your library`);
}

async function importFiles(files) {
  let latest, count = 0;
  const errors = [];
  for (const file of files) {
    try {
      if (!/\.(md|markdown|mdown|txt)$/i.test(file.name)) throw new Error('Choose a .md, .markdown, .mdown, or .txt file.');
      if (file.size > 2 * 1024 * 1024) throw new Error('The 2 MB file limit was exceeded.');
      latest = await addDocument(await file.text(), file.name); count++;
    } catch (error) { errors.push(`${file.name}: ${error.message}`); }
  }
  if (latest) await openDocument(latest.id);
  updateLibrary();
  if (errors.length) showSheet('A few files need attention', `<p class="sheet-description">${count} document${count === 1 ? '' : 's'} added.</p><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul><button class="primary-button" data-action="import">Try another file</button>`);
  else if (count) toast(`${count} document${count === 1 ? '' : 's'} added to your library`);
}

function emptyLibrary() {
  current = null; headings = []; prefs.current = ''; rememberPreferences();
  content.innerHTML = '<h1>A little room<br />for your next read.</h1><p>Bring something worth keeping. Your Markdown documents will find a home here.</p><button class="primary-button" data-action="import">Add your first document</button>';
  $('#current-filename').textContent = 'Your library'; $('#collection-label').textContent = 'A FRESH PAGE'; $('#reading-time').textContent = '';
  $('#desktop-outline').innerHTML = ''; $('.outline-sidebar').style.visibility = 'hidden';
  $('#reading-progress-bar').style.width = '0%';
  const url = new URL(location.href); url.searchParams.delete('doc'); url.hash = ''; history.replaceState({}, '', url);
  document.title = 'Folio — Your library'; updateLibrary(); updateBookmark(); window.scrollTo(0, 0);
}

const actions = {
  'share-help': showShareHelp,
  'retry-share': () => location.reload(),
  library: showLibrary,
  import: showImport,
  'choose-files': () => { $('#file-input').value = ''; $('#file-input').click(); },
  outline: () => { showSheet('On this page', `<nav class="outline-list sheet-outline" aria-label="Document outline">${outlineMarkup()}</nav>`); updateProgress(false); },
  appearance: showAppearance,
  search: showSearch,
  more: showMore,
  about: showAbout,
  bookmark: async () => {
    if (!current) return;
    current.bookmarked = !current.bookmarked;
    const saved = await persist(current);
    updateBookmark(); updateLibrary();
    if (sheet.open && $('#sheet-title').textContent === 'Your document') showMore();
    toast(saved ? current.bookmarked ? 'Kept close. Bookmark saved.' : 'Bookmark removed' : 'Bookmark changed for this session; storage is unavailable.');
  },
  focus: () => { closeSheet(); document.body.classList.toggle('focus'); $$('[data-action="focus"]').forEach(el => el.setAttribute('aria-pressed', String(document.body.classList.contains('focus')))); updateProgress(false); },
  download: () => { if (current) { download(current.content, current.name); toast('Original Markdown downloaded'); } },
  source: () => { if (current) showSheet('Behind the page', `<p class="sheet-description">${esc(current.name)}</p><button class="secondary-button" id="copy-source">Copy Markdown</button><pre class="source-view" tabindex="0">${esc(current.content)}</pre>`); },
  remove: () => { if (current) showSheet('Remove this document?', `<p class="sheet-description">“${esc(current.title)}” will be removed from this browser’s library. Your original file is unaffected.</p><button class="primary-button" data-action="confirm-remove">Remove from library</button><button class="text-button" data-action="close">Keep reading</button>`); },
  'confirm-remove': async () => {
    if (!current) return;
    const id = current.id;
    clearTimeout(scrollTimer);
    try { await deleteDocument(id); } catch { toast('The document could not be removed. Try again.'); return; }
    documents = documents.filter(doc => doc.id !== id); current = null;
    closeSheet();
    if (documents.length) await openDocument(documents[0].id); else emptyLibrary();
    toast('Document removed');
  },
  close: closeSheet,
  'export-library': () => { download(JSON.stringify({ format: 'folio-library', version: 1, documents }, null, 2), 'folio-library.json', 'application/json'); toast('Library backup downloaded'); },
  'restore-library': () => {
    showSheet('Restore your library', '<p class="sheet-description">Choose a Folio JSON backup. Restored documents are added to your library alongside your existing files.</p><label class="field-label" for="backup-input">Library backup</label><input class="field-input" type="file" id="backup-input" accept=".json,application/json" /><p id="restore-error" class="error-message" role="alert"></p>');
  },
  install: async () => { if (!pendingInstall) return showAbout(); await pendingInstall.prompt(); await pendingInstall.userChoice; pendingInstall = null; showAbout(); },
};

document.addEventListener('click', async event => {
  const target = event.target.closest('button,a');
  if (!target) return;
  if (target.dataset.action) { await actions[target.dataset.action]?.(); return; }
  if (target.dataset.document) { await openDocument(target.dataset.document); return; }
  if (target.dataset.filter) { filter = target.dataset.filter; updateLibrary(); return; }
  if (target.dataset.heading) {
    event.preventDefault(); closeSheet();
    const heading = document.getElementById(target.dataset.heading);
    heading?.scrollIntoView({ behavior: motion(), block: 'start' }); heading?.focus({ preventScroll: true });
    const url = new URL(location.href); url.hash = target.dataset.heading; history.replaceState({}, '', url); return;
  }
  if (target.dataset.theme || target.dataset.font || target.dataset.width) {
    const key = target.dataset.theme ? 'theme' : target.dataset.font ? 'font' : 'width';
    prefs[key] = target.dataset[key];
    $$(`#sheet-content [data-${key}]`).forEach(button => button.setAttribute('aria-pressed', String(button.dataset[key] === prefs[key])));
    rememberPreferences(); applyAppearance(key === 'theme'); return;
  }
  if ('copy' in target.dataset) { await copyText(target.dataset.copy, target); return; }
  if ('wrapCode' in target.dataset) { const on = target.closest('.code-block').classList.toggle('wrap'); target.setAttribute('aria-pressed', String(on)); return; }
  if ('expandDiagram' in target.dataset) {
    const block = target.closest('.diagram-block'); diagramSource = block.dataset.mermaid;
    $('#expanded-diagram').innerHTML = block.querySelector('.diagram-canvas').innerHTML;
    diagramDialog.showModal();
    const naturalWidth = $('#expanded-diagram svg')?.viewBox.baseVal.width || 600;
    diagramWidth = Math.max($('#expanded-diagram').clientWidth - 70, naturalWidth);
    diagramZoom = 1; updateZoom(); refreshIcons(); return;
  }
  if ('searchResult' in target.dataset) {
    const block = searchTargets[Number(target.dataset.searchResult)]; closeSheet();
    if (block) { block.style.scrollMarginTop = '120px'; block.scrollIntoView({ behavior: motion(), block: 'center' }); block.tabIndex = -1; block.focus({ preventScroll: true }); block.classList.add('search-target'); setTimeout(() => block.classList.remove('search-target'), 2000); }
  }
  if (target.id === 'copy-source' && current) await copyText(current.content, target);
});

document.addEventListener('input', event => {
  const target = event.target;
  if (target.id === 'document-title') draft.title = target.value;
  if (target.id === 'markdown-input') draft.markdown = target.value;
  if (target.id === 'library-filter' || target.id === 'mobile-library-filter') { filterText = target.value; $('#library-filter').value = filterText; updateLibrary(); }
  if (target.id === 'document-search') findPassages(target.value);
  if (target.id === 'font-size') { prefs.size = Number(target.value); $('#font-size-value').textContent = `${prefs.size} px`; applyAppearance(); rememberPreferences(); }
  if (target.id === 'line-height') { prefs.leading = Number(target.value); $('#line-height-value').textContent = prefs.leading.toFixed(2); applyAppearance(); rememberPreferences(); }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'paste-form') return;
  event.preventDefault();
  const form = event.target, button = form.querySelector('[type="submit"]');
  const raw = $('#markdown-input').value, title = $('#document-title').value;
  const name = `${(title.trim() || titleFrom(raw)).replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-').slice(0, 100) || 'document'}.md`;
  button.disabled = true; button.textContent = 'Adding…';
  try { const doc = await addDocument(raw, name, title); draft = { title: '', markdown: '' }; await openDocument(doc.id); toast('A new page in your library'); }
  catch (error) { if ($('#import-error')) $('#import-error').textContent = error.message; }
  finally { button.disabled = false; button.textContent = 'Add to your library'; }
});

$('#file-input').addEventListener('change', event => importFiles([...event.target.files]));
document.addEventListener('change', async event => {
  if (event.target.id !== 'backup-input') return;
  const input = event.target, file = input.files[0]; if (!file) return;
  let count = 0; input.disabled = true;
  try {
    if (file.size > 30 * 1024 * 1024) throw new Error('This backup is larger than 30 MB. Restore a smaller backup.');
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'folio-library' || backup.version !== 1 || !Array.isArray(backup.documents) || backup.documents.length > 500) throw new Error('Choose a valid Folio library backup with up to 500 documents.');
    // Validate the complete backup before committing the first document.
    for (const item of backup.documents) if (typeof item.content !== 'string' || !item.content.trim() || new Blob([item.content]).size > 2 * 1024 * 1024 || typeof item.name !== 'string' || typeof item.title !== 'string') throw new Error('This backup contains an invalid or oversized document.');
    for (const item of backup.documents) {
      const doc = await addDocument(item.content, item.name, item.title); count++;
      doc.bookmarked = !!item.bookmarked; doc.progress = Math.min(1, Math.max(0, Number(item.progress) || 0)); doc.scrollY = Math.max(0, Number(item.scrollY) || 0); await persist(doc);
    }
    updateLibrary(); showLibrary(); toast(`${count} documents restored`);
    if (!current && documents[0]) await openDocument(documents[0].id);
  } catch (error) { if ($('#restore-error')) $('#restore-error').textContent = `${count ? `${count} documents restored. ` : ''}${error.message}`; updateLibrary(); }
  finally { input.disabled = false; }
});

$('#close-sheet').addEventListener('click', closeSheet);
$('#close-diagram').addEventListener('click', () => { document.body.append($('#toast')); diagramDialog.close(); });
for (const dialog of [sheet, diagramDialog]) {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { if ($('#toast').parentElement === dialog) document.body.append($('#toast')); });
}
function updateZoom() {
  const svg = $('#expanded-diagram svg'); if (svg) { svg.style.width = `${diagramWidth * diagramZoom}px`; svg.style.height = 'auto'; }
  $('#zoom-reset').textContent = `${Math.round(diagramZoom * 100)}%`;
  $('#zoom-out').disabled = diagramZoom <= .5; $('#zoom-in').disabled = diagramZoom >= 3;
}
$('#zoom-in').addEventListener('click', () => { diagramZoom = Math.min(3, diagramZoom + .25); updateZoom(); });
$('#zoom-out').addEventListener('click', () => { diagramZoom = Math.max(.5, diagramZoom - .25); updateZoom(); });
$('#zoom-reset').addEventListener('click', () => { diagramZoom = 1; updateZoom(); });
$('#copy-expanded').addEventListener('click', event => copyText(diagramSource, event.currentTarget));

document.addEventListener('keydown', event => {
  const editing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); showSearch(); return; }
  if (editing || sheet.open || diagramDialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); actions.focus(); }
  if (event.key === '/') { event.preventDefault(); if (matchMedia('(max-width:700px)').matches) showLibrary(); else $('#library-filter').focus(); }
});
let scrollFrame = false;
window.addEventListener('scroll', () => { if (!scrollFrame) { scrollFrame = true; requestAnimationFrame(() => { scrollFrame = false; updateProgress(); }); } }, { passive: true });
window.addEventListener('pagehide', () => { if (current) void persist(current); });
window.addEventListener('beforeunload', event => { if (draft.markdown.trim()) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && current) void persist(current); });
window.addEventListener('popstate', () => { const id = new URL(location.href).searchParams.get('doc'); if (id && id !== current?.id) void openDocument(id, false); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs.theme === 'system') applyAppearance(true); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); pendingInstall = event; });

let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragDepth++; document.body.classList.add('dragging'); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('drop', event => { if (event.dataTransfer?.files.length) { event.preventDefault(); void importFiles([...event.dataTransfer.files]); } dragDepth = 0; document.body.classList.remove('dragging'); });

async function setupOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    const ready = () => { offlineReady = true; $('#offline-label').textContent = navigator.onLine ? 'Ready for offline reading' : 'Reading offline'; };
    if (registration.active) ready();
    navigator.serviceWorker.ready.then(ready);
    window.addEventListener('online', ready); window.addEventListener('offline', ready);
    const offerUpdate = () => { if (registration.waiting) { updateAvailable = true; $('#offline-label').textContent = 'Reader update available'; $('.offline-indicator').dataset.action = 'update-app'; } };
    actions['update-app'] = () => showSheet('A fresh version is ready', '<p class="sheet-description">Reload to use the latest reader. Your library and reading place will be kept.</p><button class="primary-button" data-action="apply-update">Update & reload</button>');
    actions['apply-update'] = async () => { if (current) await persist(current); navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true }); registration.waiting?.postMessage('SKIP_WAITING'); };
    offerUpdate();
    registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', offerUpdate));
  } catch { $('#offline-label').textContent = 'Offline setup unavailable'; }
}

async function init() {
  applyAppearance(); refreshIcons();
  try {
    documents = await readDocuments();
    if (!documents.length && !prefs.initialized) {
      documents = samples.map(doc => ({ ...doc, progress: 0, scrollY: 0, bookmarked: false, addedAt: 0 }));
      await Promise.all(documents.map(saveDocument)); prefs.initialized = true; rememberPreferences();
    }
  } catch {
    storageAvailable = false;
    documents = samples.map(doc => ({ ...doc, progress: 0, scrollY: 0, bookmarked: false }));
    $('#save-status').textContent = 'Storage unavailable · Reading this session only';
    toast('Browser storage is unavailable. Your place cannot be saved.');
  }
  documents.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const shared = await consumeIncomingShare();
  const requested = new URL(location.href).searchParams.get('doc');
  const initial = documents.find(doc => doc.id === requested) || documents.find(doc => doc.id === prefs.current) || documents[0];
  const fragment = location.hash;
  const savedFragment = initial?.fragment;
  if (initial) await openDocument(initial.id, false); else emptyLibrary();
  if (fragment && fragment !== savedFragment) { try { const anchor = document.getElementById(decodeURIComponent(fragment.slice(1))); if (content.contains(anchor)) anchor?.scrollIntoView(); } catch {} }
  if (requested && !documents.some(doc => doc.id === requested)) toast('That document is not on this device. Your library is open instead.');
  if (storageAvailable && navigator.storage?.persisted) navigator.storage.persisted().catch(() => {});
  void setupOffline();
  if (shared) showShareResult(shared);
}
init().catch(error => { console.error(error); content.innerHTML = '<h1>Let’s turn the page.</h1><p>The reader could not open. Reload this page to try again; your stored documents have not been removed.</p>'; });
