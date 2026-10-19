import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'balance', include: ['test/**/*.test.ts'], testTimeout: 30000 },
});
