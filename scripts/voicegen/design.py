"""Design each villager voice with VoxCPM2 (Apache-2.0) and keep the take that best fits it.

Each voice in voice-lines.json is designed from its text description (voice design: no real
person's voice is used) several times, and the candidate whose speaking pitch is nearest the
description's typical range is kept as that voice's reference clip. gen.py then speaks every
line in that voice. The shipped references are in voices/refs/ (FLAC).

usage: python design.py <voice-lines.json> <model dir or openbmb/VoxCPM2> <out dir> <tries> [--only voice] [--from k]
Writes <out>/cands/<voice>_<k>.wav, prints each candidate's pitch, and copies the best to <out>/refs.
Setup: python -m venv venv && venv/bin/pip install -r scripts/voicegen/requirements.txt (about 7 GB with
PyTorch; the model is 4.7 GB more). Runs on a CPU at about 3x real time.
"""
import json
import os
import shutil
import sys

import librosa
import numpy as np
import soundfile as sf
import torch
from voxcpm import VoxCPM

# Calm, plain speech designs the voice best; only its sound carries over to the lines.
TEXT = "Good morning, friend. The sun is warm today, and the fields are full of flowers. Come and sit with us by the fire."
# Typical speaking pitch (Hz) for each voice's description.
TARGET = {"blue_warm": (190, 260), "blue_jolly": (110, 160), "blue_kid": (260, 380), "red_deep": (75, 125), "red_bright": (170, 240)}


def pitch(path: str) -> float:
    y, sr = librosa.load(path, sr=16000)
    p, v, _ = librosa.pyin(y, fmin=50, fmax=600, sr=sr, frame_length=2048)
    return float(np.nanmedian(p[v])) if v.any() else float("nan")


def main() -> None:
    table, model_dir, out, tries = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    first = int(sys.argv[sys.argv.index("--from") + 1]) if "--from" in sys.argv else 0
    d = json.load(open(table))
    torch.set_num_threads(os.cpu_count() or 4)
    model = VoxCPM.from_pretrained(model_dir, load_denoiser=False, optimize=False)
    sr = model.tts_model.sample_rate
    os.makedirs(f"{out}/cands", exist_ok=True)
    os.makedirs(f"{out}/refs", exist_ok=True)
    for i, (name, desc) in enumerate(d["voices"].items()):
        if only and name != only:
            continue
        lo, hi = TARGET[name]
        mid = (lo * hi) ** 0.5
        best, bscore = None, 1e9
        for k in range(first, first + tries):
            path = f"{out}/cands/{name}_{k}.wav"
            torch.manual_seed(5000 + i * 100 + k)
            wav = model.generate(text=f"({desc}){TEXT}", cfg_value=2.0, inference_timesteps=10, max_len=1024,
                                 retry_badcase=False, retry_badcase_max_times=1)
            sf.write(path, wav, sr)
            f = pitch(path)
            score = abs(np.log(f / mid)) if f == f else 9
            print(f"{name} cand {k}: F0 {f:5.0f} Hz (target {lo}-{hi}), {len(wav) / sr:.1f}s, peak {np.abs(wav).max():.2f}", flush=True)
            if score < bscore:
                best, bscore = path, score
        shutil.copy(best, f"{out}/refs/{name}.wav")
        print(f"-> {name}: {os.path.basename(best)}", flush=True)


if __name__ == "__main__":
    main()
