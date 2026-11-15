import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The simulation must stay free of rendering and browser APIs so it can run in tests,
// headless balance scripts and (later) a worker.
describe('src/sim architecture', () => {
  const dir = import.meta.dirname;
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  for (const f of files) {
    it(`${f} has no three / DOM / Math.random`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src).not.toMatch(/from ['"]three/);
      expect(src).not.toMatch(/\b(document|window|localStorage|requestAnimationFrame)\./);
      expect(src).not.toMatch(/Math\.random\(/);
      expect(src).not.toMatch(/from ['"]\.\.\/(render|input|ui|audio|physics)/);
    });
  }
});
