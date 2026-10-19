import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper without type declarations
import { functionsBundleOptions } from '../../../scripts/functions-bundle.mjs';

// The edge function ships a bundled copy of packages/shared: make sure it is up to date.
describe('supabase functions bundle', () => {
  it('matches the current shared sources (run `pnpm build:functions` if this fails)', async () => {
    const root = resolve(__dirname, '../../..');
    const options = functionsBundleOptions(root);
    const committed = readFileSync(options.outfile, 'utf8');
    const result = await build({ ...options, write: false });
    expect(result.outputFiles?.[0]?.text === committed).toBe(true);
  });
});
