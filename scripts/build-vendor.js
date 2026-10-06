import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  stdin: { contents: "export { createClient } from '@supabase/supabase-js';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  outfile: fileURLToPath(new URL('../assets/supabase.js', import.meta.url)),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
});
