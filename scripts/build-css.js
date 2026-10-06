import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import './build-vendor.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceCss = await readFile(join(projectRoot, 'src/styles/app.css'), 'utf8');
const themePath = fileURLToPath(import.meta.resolve('tailwindcss/theme.css'));
const preflightPath = fileURLToPath(import.meta.resolve('tailwindcss/preflight.css'));
const [themeCss, preflightCss] = await Promise.all([
  readFile(themePath, 'utf8'),
  readFile(preflightPath, 'utf8'),
]);

const compilerInput = `
@layer theme, base, components, utilities;
${themeCss}
@layer base {
${preflightCss}
}
${sourceCss}
`;

const compiler = await compile(compilerInput);
const candidates = await collectCandidates([
  join(projectRoot, 'index.html'),
  join(projectRoot, 'src'),
]);
const output = compiler.build([...candidates]);
const outputPath = join(projectRoot, 'assets/app.css');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
console.log(`Tailwind CSS: ${candidates.size} candidatos → ${outputPath}`);

async function collectCandidates(paths) {
  const candidates = new Set();
  for (const path of paths) {
    for (const file of await listSourceFiles(path)) {
      const text = await readFile(file, 'utf8');
      const tokens = text.match(/[A-Za-z0-9_!:@./%\[\]\-]+/g) ?? [];
      for (const token of tokens) {
        if (token.length > 0 && token.length < 120) candidates.add(token);
      }
    }
  }
  return candidates;
}

async function listSourceFiles(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];

  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(child));
    else if (/\.(html|js)$/.test(entry.name)) files.push(child);
  }
  return files;
}
