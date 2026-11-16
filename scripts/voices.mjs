// Turns a folder or zip of recorded villager lines into game clips. Usage:
//   npm run voices -- path/to/voices.zip     (or a folder)
// Each audio file named after a line in src/audio/voice-lines.json (e.g. throw_1.wav; any of
// wav/flac/mp3/ogg/m4a/opus, any case, spaces or dashes for underscores) is trimmed of
// silence at both ends, levelled to -18 LUFS, capped at 3.5 s with a short fade, and
// written as mono 32 kHz Ogg Vorbis to src/assets/voices/<line>.ogg. Unknown files are listed
// and skipped. The input is only read; a zip is unpacked into a fresh temporary folder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('usage: npm run voices -- <folder or .zip>');
  process.exit(1);
}
const T = JSON.parse(readFileSync('src/audio/voice-lines.json', 'utf8'));
const wanted = new Set(T.lines.map((l) => l[0]));
const OUT = 'src/assets/voices';
mkdirSync(OUT, { recursive: true });

let dir = resolve(src), tmp = null;
if (statSync(dir).isFile()) {
  tmp = mkdtempSync(join(tmpdir(), 'hv-voices-'));
  execFileSync('unzip', ['-q', '-o', dir, '-d', tmp]);
  dir = tmp;
}
const AUDIO = new Set(['.wav', '.flac', '.mp3', '.ogg', '.m4a', '.opus', '.aac']);
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    if (f.startsWith('.') || f === '__MACOSX') continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (AUDIO.has(extname(f).toLowerCase())) files.push(p);
  }
};
walk(dir);

const key = (p) => basename(p, extname(p)).toLowerCase().trim().replace(/[\s-]+/g, '_');
const filter = [
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak',
  'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06:detection=peak', 'areverse',
  'loudnorm=I=-18:TP=-2:LRA=11', 'atrim=0:3.5', 'areverse', 'afade=t=in:d=0.03', 'areverse',
].join(',');
const done = new Set(), unknown = [];
for (const p of files) {
  const k = key(p);
  if (!wanted.has(k)) {
    unknown.push(basename(p));
    continue;
  }
  if (done.has(k)) {
    console.warn(`  two files for ${k}; keeping the first`);
    continue;
  }
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', p, '-af', filter, '-ac', '1', '-ar', '32000', '-c:a', 'libvorbis', '-q:a', '4', join(OUT, `${k}.ogg`)]);
  done.add(k);
}
if (tmp) rmSync(tmp, { recursive: true, force: true });
const missing = [...wanted].filter((k) => !done.has(k));
let bytes = 0;
for (const k of done) bytes += statSync(join(OUT, `${k}.ogg`)).size;
console.log(`voices: ${done.size} of ${wanted.size} lines processed into ${OUT} (${(bytes / 1024).toFixed(0)} KB)`);
if (missing.length) console.log(`  still missing (${missing.length}): ${missing.join(', ')}`);
if (unknown.length) console.log(`  not in the sheet, skipped (${unknown.length}): ${unknown.join(', ')}`);
