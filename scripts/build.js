import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import './build-css.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  cp(join(root, 'index.html'), join(dist, 'index.html')),
  cp(join(root, 'src'), join(dist, 'src'), { recursive: true }),
  cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true }),
  cp(join(root, 'public'), dist, { recursive: true }),
]);

const files = (await listFiles(dist))
  .filter((file) => !file.endsWith(`${sep}sw.js`))
  .map((file) => `./${relative(dist, file).split(sep).join('/')}`)
  .sort();

const swPath = join(dist, 'sw.js');
const sw = await readFile(swPath, 'utf8');
await writeFile(swPath, sw.replace("['__BUILD_ASSETS__']", JSON.stringify(files, null, 2)));
console.log(`Build PWA creado en ${dist}`);

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else files.push(child);
  }
  return files;
}
