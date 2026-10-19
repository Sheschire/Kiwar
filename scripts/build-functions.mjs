// Bundles packages/shared into a single ES module for the Supabase edge functions (Deno),
// so the server runs exactly the same rules as the client.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { functionsBundleOptions } from './functions-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = functionsBundleOptions(root);
await build(options);
console.log(`Bundled shared rules → ${options.outfile}`);
