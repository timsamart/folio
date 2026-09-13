import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { receiveShare, shareCacheName } from './share-target.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const defaultBase = '/folio/';

function staticFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? staticFiles(path) : [path];
  });
}

// Every renderer, font and diagram chunk ships with the reader for offline use.
function offlineReader() {
  let base = defaultBase;
  return {
    name: 'folio-offline',
    enforce: 'post',
    configResolved(config) { base = config.base; },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const assets = staticFiles(join(root, 'static'));
      const shareReceiver = receiveShare.toString();
      const revision = createHash('sha256').update(shareReceiver + files.map(name => {
        const item = bundle[name];
        return name + (item.type === 'chunk' ? item.code : item.source);
      }).join('') + assets.map(path => readFileSync(path).toString('base64')).join('')).digest('hex').slice(0, 12);
      const prefix = `folio-${createHash('sha256').update(base).digest('hex').slice(0, 8)}-`;
      const cacheName = `${prefix}${revision}`;
      const urls = [...files.map(name => base + name), ...assets.map(path => base + relative(join(root, 'static'), path).replaceAll('\\', '/'))];
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(urls)};
const receiveShare = ${shareReceiver};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(${JSON.stringify(prefix)}) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === ${JSON.stringify(base + 'share-target')} && event.request.method === 'POST') {
    event.respondWith(receiveShare(event.request, { base: ${JSON.stringify(base)}, origin: self.location.origin, cacheName: ${JSON.stringify(shareCacheName(base))} }));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(${JSON.stringify(base)})) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const key = event.request.mode === 'navigate' ? ${JSON.stringify(base + 'index.html')} : event.request;
    // Vite adds Vary: Origin. These are fixed, same-origin public build assets,
    // so module requests and precache requests must resolve to the same entry.
    return (await cache.match(key, { ignoreVary: true })) || fetch(event.request);
  }));
});
` });
    },
  };
}

export default defineConfig({
  root,
  base: defaultBase,
  publicDir: 'static',
  plugins: [offlineReader()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1300,
  },
});
