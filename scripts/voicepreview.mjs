// Strings the voice clips together, played as the game plays them, for listening outside the
// game: shots/voices-preview.mp3 has every villager line (sped up by SPEED in src/audio/voices.ts),
// and shots/pet-<kind>.mp3 has each pet's sounds at young pitch, then a few at baby and grand
// pitch (PET_RATE). Lines come in table order, with a short pause between them.
// Usage: npm run voicepreview
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const src = readFileSync('src/audio/voices.ts', 'utf8');
const SPEED = Number(/const SPEED = ([\d.]+)/.exec(src)?.[1] ?? 1);
const PET_RATE = JSON.parse(/const PET_RATE = (\[[^\]]+\])/.exec(src)?.[1] ?? '[1.25, 1, 0.82]');
const PETS = ['sheep', 'monkey', 'chicken'];
const T = JSON.parse(readFileSync('src/audio/voice-lines.json', 'utf8'));
const clip = (f) => `src/assets/voices/${f}.ogg`;

/** Write clips (each [file, rate]) to dest as one mp3 with a pause after each. */
function reel(clips, dest) {
  clips = clips.filter(([f]) => existsSync(clip(f)));
  if (!clips.length) return 0;
  const parts = clips.map(([, r], i) => `[${i}:a]asetrate=${Math.round(32000 * r)},aresample=44100,apad=pad_dur=0.5[a${i}]`);
  const filter = `${parts.join(';')};${clips.map((_, i) => `[a${i}]`).join('')}concat=n=${clips.length}:v=0:a=1[out]`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...clips.flatMap(([f]) => ['-i', clip(f)]), '-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-q:a', '3', dest]);
  return clips.length;
}

mkdirSync('shots', { recursive: true });
const n = reel(T.lines.filter((l) => !PETS.includes(l[1])).map(([f]) => [f, SPEED]), 'shots/voices-preview.mp3');
console.log(`shots/voices-preview.mp3: ${n} villager clips at x${SPEED}`);
for (const kind of PETS) {
  const mine = T.lines.filter((l) => l[1] === kind).map(([f]) => f);
  const few = mine.filter((f) => /_(happy|eat|play|cheer)_1$/.test(f));
  const m = reel([...mine.map((f) => [f, PET_RATE[1]]), ...few.map((f) => [f, PET_RATE[0]]), ...few.map((f) => [f, PET_RATE[2]])], `shots/pet-${kind}.mp3`);
  if (m) console.log(`shots/pet-${kind}.mp3: ${mine.length} sounds at young pitch, then ${few.length} as a baby and ${few.length} grand`);
}
