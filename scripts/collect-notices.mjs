import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const notices = ['Folio dependency notices\nGenerated from the exact package-lock.json installation.'];
for (const [directory, entry] of Object.entries(lock.packages)) {
  if (!directory.startsWith('node_modules/')) continue;
  if (!existsSync(join(directory, 'package.json'))) continue; // Other platforms' optional binaries.
  const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const files = readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && /^(licen[cs]e|copying|notice)([. -]|$)/i.test(file.name));
  notices.push(`\n${'='.repeat(72)}\n${metadata.name} ${entry.version}\nLicense: ${metadata.license || entry.license || 'See upstream package'}\n${metadata.homepage || ''}\n`);
  for (const file of files) notices.push(readFileSync(join(directory, file.name), 'utf8'));
}
writeFileSync('static/licenses/dependencies.txt', notices.join('\n'));
console.log('Collected installed dependency license notices.');
