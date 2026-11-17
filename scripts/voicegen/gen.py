"""Make Hearthvale's villager voice lines with VoxCPM2 (Apache-2.0), best of N takes.

Each voice was designed from its text description (design.py) and saved as a reference clip;
every line in that voice uses the reference so it stays the same person, and the line's "how"
note steers its delivery. Each line gets N takes; a take is scored by how close Whisper's
transcript is to the written words, how much of it is voiced, its pitch against the voice's
own, and its length. The best take is kept, and every take's numbers go to report.txt.

usage: python gen.py <voice-lines.json> <model dir or openbmb/VoxCPM2> <out dir> [takes] [--only a,b] [--refs dir] [--seed n]
(--seed shifts every take's seed, to remake a few lines with fresh takes.)
References come from --refs (default <out>/refs; the shipped ones are voices/refs/*.flac). The
chosen takes go to <out>/lines/<file>.wav; then `npm run voices -- <out>/lines` makes the game clips.
"""
import difflib
import json
import os
import re
import sys
import time

import librosa
import numpy as np
import soundfile as sf
import torch
from transformers import pipeline
from voxcpm import VoxCPM


# Lines are quick calls (a word or two): takes outside this length, in seconds, lose points.
SHORTEST, LONGEST = 0.3, 1.8


# If Whisper hears a rude word, a player might too: such a take is never kept (unless the word is
# really in the line, like a rooster's "cock-a-doo").
RUDE = re.compile(r"\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|dick\w*|cock\w*|ass|arse\w*|piss\w*|bastard\w*|damn\w*|"
                  r"wank\w*|twat\w*|slut\w*|whore\w*|tits?|nigg\w*|fag\w*|crap\w*|bollock\w*)\b", re.I)


def rude(heard: str, text: str) -> bool:
    return any(w.lower()[:4] not in text.lower() for w in RUDE.findall(heard))


def letters(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def pitch(y16: np.ndarray) -> tuple[float, float]:
    p, v, _ = librosa.pyin(y16, fmin=50, fmax=700, sr=16000, frame_length=1024)
    return (float(np.nanmedian(p[v])) if v.any() else float("nan")), float(v.mean())


def main() -> None:
    table, model_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
    takes = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 3
    only = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else None
    refs = sys.argv[sys.argv.index("--refs") + 1] if "--refs" in sys.argv else f"{out}/refs"
    seed0 = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 0
    d = json.load(open(table))
    torch.set_num_threads(os.cpu_count() or 4)
    model = VoxCPM.from_pretrained(model_dir, load_denoiser=False, optimize=False)
    asr = pipeline("automatic-speech-recognition", model="openai/whisper-base", device="cpu")
    sr = model.tts_model.sample_rate
    os.makedirs(f"{out}/lines", exist_ok=True)
    os.makedirs(f"{out}/takes", exist_ok=True)
    ref_path, ref_f0 = {}, {}
    for name in d["voices"]:
        ref_path[name] = next(f"{refs}/{name}.{e}" for e in ("flac", "wav") if os.path.exists(f"{refs}/{name}.{e}"))
        y16, _ = librosa.load(ref_path[name], sr=16000)
        ref_f0[name] = pitch(y16)[0]
    report = open(f"{out}/report.txt", "a")

    for j, (file, voice, text, how) in enumerate(d["lines"]):
        if only and file not in only:
            continue
        best, bscore = None, -1e9
        for k in range(takes):
            t = time.time()
            torch.manual_seed(seed0 + 7000 + j * 10 + k)
            wav = model.generate(
                text=f"({how}){text}", cfg_value=2.0, inference_timesteps=10, max_len=min(4096, max(256, len(text) * 6)),
                retry_badcase=False, retry_badcase_max_times=1, reference_wav_path=ref_path[voice],
            )
            path = f"{out}/takes/{file}_{k}.wav"
            sf.write(path, wav, sr, subtype="FLOAT")
            y16 = librosa.resample(np.asarray(wav, dtype=np.float32), orig_sr=sr, target_sr=16000)
            dur = len(wav) / sr
            f0, voiced = pitch(y16)
            heard = asr({"raw": y16, "sampling_rate": 16000}, generate_kwargs={"language": "en", "max_new_tokens": 40})["text"].strip()
            want = letters(text)
            sim = difflib.SequenceMatcher(None, want, letters(heard)[: len(want) * 2]).ratio()
            rel = f0 / ref_f0[voice] if f0 == f0 else 3.0
            score = sim + min(voiced, 0.6) * 0.5
            score -= 0.4 * max(0.0, abs(np.log(rel)) - np.log(1.8))  # pitch far from the voice's own
            score -= 0.8 * max(0.0, dur - LONGEST) + 0.8 * max(0.0, SHORTEST - dur)  # too long or too short
            if rude(heard, text):
                score -= 10
            line = (f"{file:14s} {voice:10s} take {k}: {dur:4.2f}s F0 {f0:4.0f} ({rel:4.2f}x) voiced {voiced:.2f} "
                    f"peak {np.abs(wav).max():.2f} sim {sim:.2f} score {score:.2f} | {text} -> {heard[:60]} [{time.time() - t:.0f}s]")
            print(line, flush=True)
            report.write(line + "\n")
            if score > bscore:
                best, bscore, bwav = k, score, wav
        sf.write(f"{out}/lines/{file}.wav", bwav, sr, subtype="FLOAT")
        report.write(f"-> {file}: take {best}\n")
        print(f"-> {file}: take {best}", flush=True)


if __name__ == "__main__":
    main()
