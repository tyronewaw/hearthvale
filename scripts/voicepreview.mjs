// Strings every villager voice clip together, played as the game plays them (sped up, see SPEED
// in src/audio/voices.ts), into shots/voices-preview.mp3, for listening to the voices outside the
// game. Lines come in table order, with a short pause between them. Usage: npm run voicepreview
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const SPEED = Number(/const SPEED = ([\d.]+)/.exec(readFileSync('src/audio/voices.ts', 'utf8'))?.[1] ?? 1);
const T = JSON.parse(readFileSync('src/audio/voice-lines.json', 'utf8'));
const files = T.lines.map(([f]) => `src/assets/voices/${f}.ogg`).filter((f) => existsSync(f));
if (!files.length) {
  console.error('no clips in src/assets/voices yet');
  process.exit(1);
}
mkdirSync('shots', { recursive: true });
const parts = files.map((_, i) => `[${i}:a]asetrate=${Math.round(32000 * SPEED)},aresample=44100,apad=pad_dur=0.45[a${i}]`);
const filter = `${parts.join(';')};${files.map((_, i) => `[a${i}]`).join('')}concat=n=${files.length}:v=0:a=1[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '3', 'shots/voices-preview.mp3']);
console.log(`shots/voices-preview.mp3: ${files.length} clips at ×${SPEED}`);
