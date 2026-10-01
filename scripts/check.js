import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [
  ...await jsFiles(join(root, 'src')),
  ...await jsFiles(join(root, 'scripts')),
  join(root, 'public/sw.js'),
];

for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
console.log(`Sintaxis correcta en ${files.length} archivos JavaScript.`);

async function jsFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await jsFiles(child));
    else if (entry.name.endsWith('.js')) result.push(child);
  }
  return result;
}
