// Writes the villager voice sheet (voices/VOICE_SHEET.md and voices/lines.csv) from
// src/audio/voice-lines.json, the one table the game also reads. Usage: npm run voicesheet
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const T = JSON.parse(readFileSync('src/audio/voice-lines.json', 'utf8'));
mkdirSync('voices', { recursive: true });
const byVoice = {};
for (const [file, voice, text, how] of T.lines) (byVoice[voice] ??= []).push({ file, text, how });

const md = [];
md.push('# Hearthvale villager voices: recording sheet', '');
md.push(`${T.lines.length} short clips in five voices. The villagers speak a made-up, friendly tribal language, so the words are nonsense on purpose: say them as written.`, '');
md.push('The game already has a take of every line, made with VoxCPM2 from these same voice descriptions (`scripts/voicegen/`; the five designed voices are in `voices/refs/`). To replace any line with your own take, make it in VoiceStudio as below and send it: a file with the same name replaces the game\'s.', '');
md.push('## In VoiceStudio', '');
md.push('1. **Engine: VoxCPM2** (Model Catalogue). It is Apache-2.0, so its output can ship in the game, and it can *design* a voice from a description, so no real person\'s voice is cloned.');
md.push('   - Do **not** use the default OmniVoice engine: its weights are non-commercial only. Avoid Llama-OuteTTS (non-commercial) and Chatterbox (licence unclear) too.');
md.push('   - Your Radeon runs VoxCPM2 on the CPU on Windows. That is fine for clips this short.');
md.push('2. Open **Voice design**. For each voice below, paste its description, generate a test line, and keep regenerating until you like it. Note the **seed** if there is one, and reuse the same description and seed for every line in that voice so it stays the same person.');
md.push('3. For each line, put the text in the text box and the "how" note in the **Style** field. Generate 2 or 3 takes and keep the best.');
md.push('4. Export as **WAV** (or FLAC/MP3) named **exactly** as the File column, e.g. `throw_1.wav`. Don\'t worry about silence at the ends or loudness: I trim, level and convert everything.');
md.push('5. Put all the files in one folder, zip it, and attach the zip in our chat. Send only the ones you want to replace; the rest stay as they are.', '');
md.push('## The voices', '');
for (const [v, desc] of Object.entries(T.voices)) md.push(`- **${v}**: ${desc} (${byVoice[v]?.length ?? 0} lines)`);
md.push('');
for (const [v, rows] of Object.entries(byVoice)) {
  md.push(`## ${v}`, '', `> Voice design: *${T.voices[v]}*`, '', '| File | Say | How (Style) |', '|---|---|---|');
  for (const r of rows) md.push(`| \`${r.file}.wav\` | ${r.text} | ${r.how} |`);
  md.push('');
}
md.push('## When each line plays', '');
for (const [k, when] of Object.entries(T.events)) md.push(`- \`${k}_*\`: ${when}`);
md.push('');
writeFileSync('voices/VOICE_SHEET.md', md.join('\n'));

const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csv = ['file,voice,voice_description,text,style', ...T.lines.map(([f, v, t, h]) => [f + '.wav', v, T.voices[v], t, h].map(q).join(','))];
writeFileSync('voices/lines.csv', csv.join('\n') + '\n');
console.log(`voices/VOICE_SHEET.md and voices/lines.csv: ${T.lines.length} lines in ${Object.keys(byVoice).length} voices`);
