import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const directory = resolve(process.argv[2] || 'dist');
const base = process.argv[3] || '/folio/';
const html = readFileSync(join(directory, 'index.html'), 'utf8');
const worker = readFileSync(join(directory, 'sw.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.webmanifest'), 'utf8'));
const assets = JSON.parse(worker.match(/const ASSETS = (\[[^\n]+\]);/)[1]);
assert(assets.length > 20, 'Renderers and fonts must be precached');
for (const asset of assets) {
  assert(asset.startsWith(base), `Unexpected offline scope: ${asset}`);
  assert(existsSync(join(directory, asset.slice(base.length))), `Missing offline asset: ${asset}`);
}
for (const [, asset] of html.matchAll(/(?:src|href)="([^"]+\/assets\/[^"?]+)"/g)) {
  assert(assets.includes(asset), `HTML dependency is not precached: ${asset}`);
}
assert(!html.includes('/apps/folio/'), 'Portfolio paths must not leak into the standalone build');
assert.equal(manifest.start_url, './index.html');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.share_target.action, './share-target');
assert.equal(manifest.share_target.method, 'POST');
assert.equal(manifest.share_target.enctype, 'multipart/form-data');
assert(manifest.share_target.params.files[0].accept.includes('.md'));
assert(worker.includes(JSON.stringify(base + 'share-target')), 'Share receiver must use the hosting base');
for (const icon of manifest.icons) assert(existsSync(join(directory, icon.src)), `Missing icon: ${icon.src}`);
assert(assets.some(path => path.includes('source-serif-4')), 'Reading font must be bundled');
assert(assets.some(path => path.includes('mermaid.core')), 'Mermaid must be bundled');
assert(assets.some(path => path.includes('KaTeX_Main')), 'Math fonts must be bundled');
console.log(`Verified ${assets.length} offline assets, manifest, icons, and ${base} hosting path.`);
