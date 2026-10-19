import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM helper without type declarations
import { sqlBundle, sqlBundlePath } from '../../../scripts/sql-bundle.mjs';

// supabase/setup.sql is what the owner pastes into Supabase: keep it in sync with migrations.
describe('supabase setup.sql', () => {
  it('contains every migration (run `pnpm build:sql` if this fails)', () => {
    const root = resolve(__dirname, '../../..');
    expect(readFileSync(sqlBundlePath(root), 'utf8')).toBe(sqlBundle(root));
  });
});
