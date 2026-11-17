"""Cut the pet sounds from real animal recordings (public domain, CC0 or CC-BY; see ASSETS.md).

Each recording is split into single calls at its quiet gaps. An AudioSet sound classifier (AST,
used only for checking, never shipped) scores every call for its animal, and the clearest calls
become the pet's seven sounds, two takes each:
  happy  a clear, medium call            call   a short, crisp call
  sad    a call lowered and slowed        eat    chewing (sheep, monkey) or pecking clucks (hen)
  play   two quick calls back to back     sleep  the softest call, lowered and muffled
  cheer  the biggest call (the rooster's crow for the hen)
The game then pitches every clip by the pet's growth stage, so a baby squeaks higher.

usage: python animals.py <sources.json> <out dir> [ast model dir]
sources.json lists each recording (title, file relative to it, licence...) as fetched from
Wikimedia Commons; SPECIES below says which recordings belong to which pet.
Writes <out>/<kind>_<ev>_<n>.wav and <out>/report.txt; then `npm run voices -- <out>`.
"""
import json
import os
import sys

import librosa
import numpy as np
import soundfile as sf
import torch
from transformers import ASTFeatureExtractor, ASTForAudioClassification

SR = 32000
# Which recordings (by title prefix) each pet's calls come from, the AudioSet classes that say
# "this is my animal", and the recording that eating sounds come from.
SPECIES = {
    "sheep": {"src": ["Sheep bleating", "Sheep bleat", "Corner of a sheep field", "Herd of goats"], "cls": ["Sheep", "Bleat", "Goat"],
              "eat": "Chewing gum mouth close", "cheer_src": None},
    "chicken": {"src": ["Chickens demanding food", "Hen announcing", "Hens leaving coop", "মুরগির"], "cls": ["Chicken, rooster", "Cluck", "Fowl"],
                "eat": "Chickens demanding food", "cheer_src": ["Medium rooster crowing", "Small rooster crowing"]},
    "monkey": {"src": ["Capuchins", "Pant-hoot"], "cls": ["Animal", "Wild animals"],
               "eat": "Chewing gum mouth close", "cheer_src": ["Pant-hoot"]},
}
# Classes that mean the cut is mostly something else.
NOT = ["Speech", "Silence", "Wind", "Vehicle", "Music", "Rustle", "Static", "Noise", "Hum"]


def load(path: str) -> np.ndarray:
    # ffmpeg reads every Ogg flavour on Commons (some carry a Skeleton track libsndfile can't open)
    import subprocess
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, dtype=np.float32).copy()
    # take out rumble and hiss outside the voice band
    import scipy.signal as ss
    b, a = ss.butter(4, [120 / (SR / 2), 9000 / (SR / 2)], btype="band")
    return ss.filtfilt(b, a, y).astype(np.float32)


def calls(y: np.ndarray) -> list[tuple[int, int]]:
    """Single calls: louder stretches split at gaps, merged across tiny gaps, 0.18-2.6 s long."""
    iv = librosa.effects.split(y, top_db=24, frame_length=1024, hop_length=256)
    merged: list[list[int]] = []
    for s, e in iv:
        if merged and s - merged[-1][1] < 0.1 * SR:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    pad = int(0.04 * SR)
    return [(max(0, s - pad), min(len(y), e + pad)) for s, e in merged if 0.18 * SR <= e - s <= 2.6 * SR]


class Judge:
    def __init__(self, model_dir: str):
        self.fe = ASTFeatureExtractor.from_pretrained(model_dir)
        self.m = ASTForAudioClassification.from_pretrained(model_dir).eval()
        self.idx = {v: int(k) for k, v in self.m.config.id2label.items()}

    def probs(self, seg: np.ndarray) -> np.ndarray:
        y16 = librosa.resample(seg, orig_sr=SR, target_sr=16000)
        with torch.no_grad():
            x = self.fe(y16, sampling_rate=16000, return_tensors="pt")
            return torch.sigmoid(self.m(**x).logits)[0].numpy()

    def score(self, p: np.ndarray, cls: list[str]) -> tuple[float, str]:
        good = max(p[self.idx[c]] for c in cls)
        bad = max(p[self.idx[c]] for c in NOT if c in self.idx)
        top = self.m.config.id2label[int(p.argmax())]
        return float(good - 0.7 * bad), top


def shape(seg: np.ndarray, rate: float = 1.0, lowpass: float | None = None, gain_db: float = 0.0) -> np.ndarray:
    """Pitch and pace together by `rate` (like a tape), optional muffling, and a gentle fade at both ends."""
    if rate != 1.0:
        seg = librosa.resample(seg, orig_sr=SR, target_sr=int(SR / rate))
    if lowpass:
        import scipy.signal as ss
        b, a = ss.butter(2, lowpass / (SR / 2))
        seg = ss.filtfilt(b, a, seg).astype(np.float32)
    n = min(len(seg) // 4, int(0.03 * SR))
    if n:
        seg = seg.copy()
        seg[:n] *= np.linspace(0, 1, n)
        seg[-n:] *= np.linspace(1, 0, n)
    return seg * (10 ** (gain_db / 20))


def main() -> None:
    src_json, out = sys.argv[1], sys.argv[2]
    model_dir = sys.argv[3] if len(sys.argv) > 3 else "MIT/ast-finetuned-audioset-10-10-0.4593"
    base = os.path.dirname(os.path.abspath(src_json))
    sources = json.load(open(src_json))
    judge = Judge(model_dir)
    os.makedirs(out, exist_ok=True)
    rep = open(f"{out}/report.txt", "w")
    log = lambda s: (print(s, flush=True), rep.write(s + "\n"))
    by_title = {o["title"][5:]: o for o in sources}
    find = lambda pre: [o for t, o in by_title.items() if t.startswith(pre) and os.path.exists(os.path.join(base, o["file"]))]

    def cuts(prefixes: list[str], cls: list[str]):
        """Every call in these recordings, best first: (score, seg, where, top class, rms)."""
        res, seen = [], set()
        for pre in prefixes:
            for o in find(pre):
                if o["title"] in seen:  # "Sheep bleat" also matches "Sheep bleating"
                    continue
                seen.add(o["title"])
                y = load(os.path.join(base, o["file"]))
                for s, e in calls(y):
                    seg = y[s:e]
                    sc, top = judge.score(judge.probs(seg), cls)
                    rms = float(np.sqrt((seg ** 2).mean()))
                    res.append((sc, seg, f"{o['title'][5:40]} @{s / SR:.1f}s", top, rms))
        return sorted(res, key=lambda r: -r[0])

    for kind, sp in SPECIES.items():
        pool = [c for c in cuts(sp["src"], sp["cls"]) if c[0] > 0.05]
        log(f"== {kind}: {len(pool)} usable calls")
        for c in pool[:12]:
            log(f"   {c[0]:.2f} {len(c[1]) / SR:4.2f}s rms {c[4]:.3f} top={c[3]} | {c[2]}")
        if len(pool) < 6:
            log(f"!! {kind}: too few clear calls")
            continue
        dur = lambda c: len(c[1]) / SR
        used: set[str] = set()
        def pick(pred, n=2, avoid=True):
            got = [c for c in pool if pred(c) and (not avoid or c[2] not in used)][:n]
            if len(got) < n:  # fall back to the best clear calls left
                got += [c for c in pool if c not in got and (not avoid or c[2] not in used)][: n - len(got)]
            for c in got:
                used.add(c[2])
            return got
        out_clips: dict[str, list[tuple[np.ndarray, str]]] = {}
        out_clips["call"] = [(shape(c[1]), c[2]) for c in pick(lambda c: 0.2 <= dur(c) <= 0.9)]
        out_clips["happy"] = [(shape(c[1], 1.04), c[2]) for c in pick(lambda c: 0.4 <= dur(c) <= 1.4)]
        out_clips["sad"] = [(shape(c[1], 0.86, 3500), c[2] + " (lowered)") for c in pick(lambda c: 0.4 <= dur(c) <= 1.6)]
        quiet = sorted([c for c in pool if c[2] not in used and 0.3 <= dur(c) <= 1.6], key=lambda c: c[4])
        sl = quiet[:2] if len(quiet) >= 2 else pick(lambda c: True)
        for c in sl:
            used.add(c[2])
        out_clips["sleep"] = [(shape(c[1], 0.8, 2200, -4), c[2] + " (lowered, muffled)") for c in sl]
        shorts = [c for c in pool if 0.18 <= dur(c) <= 0.7]
        play = []
        for i in range(2):
            a, b = shorts[(2 * i) % len(shorts)], shorts[(2 * i + 1) % len(shorts)]
            gap = np.zeros(int(0.07 * SR), dtype=np.float32)
            play.append((np.concatenate([shape(a[1], 1.06), gap, shape(b[1], 1.12)]), f"{a[2]} + {b[2]}"))
        out_clips["play"] = play
        if sp["cheer_src"]:
            ch = cuts(sp["cheer_src"], sp["cls"] + (["Crowing, cock-a-doodle-doo"] if kind == "chicken" else []))
            ch = sorted([c for c in ch if c[0] > 0.05], key=lambda c: -(dur(c) * c[4]))[:2]
        else:
            ch = sorted([c for c in pool if c[2] not in used and dur(c) >= 0.6], key=lambda c: -(dur(c) * c[4]))[:2]
        out_clips["cheer"] = [(shape(c[1]), c[2]) for c in ch]
        if sp["eat"] == "Chickens demanding food":
            eat = sorted([c for c in pool if "demanding" in c[2] and dur(c) <= 1.2], key=lambda c: c[4])[:2]
            out_clips["eat"] = [(shape(c[1], 1.0), c[2]) for c in eat]
        else:
            chew = []
            for o in find(sp["eat"]):
                y = load(os.path.join(base, o["file"]))
                # chewing is steady: take two 1.2 s stretches with the most going on
                win = int(1.2 * SR)
                starts = sorted(range(0, len(y) - win, win // 2), key=lambda s: -float(np.sqrt((y[s:s + win] ** 2).mean())))[:2]
                chew = [(shape(y[s:s + win], 0.92 if kind == "sheep" else 1.15), f"{o['title'][5:40]} @{s / SR:.1f}s (chewing)") for s in starts]
            out_clips["eat"] = chew
        for ev, clips in out_clips.items():
            for n, (seg, where) in enumerate(clips[:2], 1):
                sf.write(f"{out}/{kind}_{ev}_{n}.wav", seg, SR, subtype="FLOAT")
                log(f"   {kind}_{ev}_{n}: {len(seg) / SR:.2f}s from {where}")
    rep.close()


if __name__ == "__main__":
    main()
