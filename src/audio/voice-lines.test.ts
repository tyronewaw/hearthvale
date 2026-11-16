import { describe, expect, it } from 'vitest';
import table from './voice-lines.json';

describe('the villager voice sheet', () => {
  it('every line has a known voice and event, a unique file name, and something to say', () => {
    const files = new Set<string>();
    for (const [file, voice, text, how] of table.lines) {
      expect(Object.keys(table.voices)).toContain(voice);
      expect(Object.keys(table.events)).toContain(file!.replace(/_\d+$/, ''));
      expect(files.has(file!)).toBe(false);
      files.add(file!);
      expect(text!.length).toBeGreaterThan(1);
      expect(how!.length).toBeGreaterThan(1);
    }
  });

  it('every event has at least two takes, so it never sounds the same twice in a row', () => {
    for (const ev of Object.keys(table.events)) expect(table.lines.filter((l) => l[0]!.replace(/_\d+$/, '') === ev).length).toBeGreaterThanOrEqual(2);
  });
});
