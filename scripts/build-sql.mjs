import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sqlBundle, sqlBundlePath } from './sql-bundle.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(sqlBundlePath(root), sqlBundle(root));
console.log(`Wrote ${sqlBundlePath(root)}`);
