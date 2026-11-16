import { defineConfig } from 'vitest/config';

// `npm run balance`: a long headless play-through that prints growth curves.
export default defineConfig({
  test: { include: ['scripts/*.balance.ts'], environment: 'node', testTimeout: 600000 },
});
