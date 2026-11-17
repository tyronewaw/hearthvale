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
    # wild capuchins, macaques and spider monkeys from iNaturalist, with gibbons whooping for a cheer
    "monkey": {"src": ["Capuchins", "iNat Sapajus", "iNat Cebus", "iNat Macaca", "iNat Ateles"],
               "cls": ["Animal", "Wild animals", "Squeal", "Squeak", "Whoop", "Hoot"],
               "not": ["Bird vocalization, bird call, bird song", "Insect", "Cricket", "Frog", "Rain"],
               "eat": "Chewing gum mouth close", "cheer_src": ["Pant-hoot", "iNat Hylobates"]},
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
    """Candidate calls: louder stretches split at quiet gaps (merged across tiny gaps, 0.18-2.6 s),
    plus windows slid along the recording, for busy ones (a yard of clucking hens) that never go quiet."""
    iv = librosa.effects.split(y, top_db=24, frame_length=1024, hop_length=256)
    merged: list[list[int]] = []
    for s, e in iv:
        if merged and s - merged[-1][1] < 0.1 * SR:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    pad = int(0.04 * SR)
    out = [(max(0, s - pad), min(len(y), e + pad)) for s, e in merged if 0.18 * SR <= e - s <= 2.6 * SR]
    if len(y) > 20 * SR:  # long field recordings have plenty of quiet gaps to split at
        return out
    for w in (0.5, 0.9, 1.4):
        n = int(w * SR)
        out += [(s, s + n) for s in range(0, len(y) - n, int(0.25 * SR))]
    return out


def floor(y: np.ndarray) -> float:
    """The recording's background level: its quietest tenth."""
    return float(np.percentile(librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0], 10)) + 1e-6


def overlap(a: tuple[int, int], b: tuple[int, int]) -> float:
    return max(0, min(a[1], b[1]) - max(a[0], b[0])) / min(a[1] - a[0], b[1] - b[0])


# Long field recordings: only this much of each is searched for calls.
MAX_SECONDS = 75


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

    def score(self, p: np.ndarray, cls: list[str], extra_not: list[str] = ()) -> tuple[float, str]:
        good = max(p[self.idx[c]] for c in cls)
        bad = max(p[self.idx[c]] for c in [*NOT, *extra_not] if c in self.idx)
        top = self.m.config.id2label[int(p.argmax())]
        return float(good - 0.7 * bad), top


def shape(seg: np.ndarray, rate: float = 1.0, lowpass: float | None = None) -> np.ndarray:
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
    return seg


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

    def cuts(prefixes: list[str], cls: list[str], extra_not: list[str] = ()) -> list[dict]:
        """The clearest calls in these recordings, best first. A call under 12 dB above the
        recording's background is left out (levelling it would bring the hiss up too), and
        quieter calls rank lower. Within each length (short, medium, long) no two overlap."""
        res, seen = [], set()
        for pre in prefixes:
            for o in find(pre):
                if o["title"] in seen:  # "Sheep bleat" also matches "Sheep bleating"
                    continue
                seen.add(o["title"])
                y = load(os.path.join(base, o["file"]))[: MAX_SECONDS * SR]
                bg = floor(y)
                cand = []
                for s, e in calls(y):
                    seg = y[s:e]
                    rms = float(np.sqrt((seg ** 2).mean()))
                    snr = 20 * np.log10(rms / bg)
                    if snr < 12:
                        continue
                    sc, top = judge.score(judge.probs(seg), cls, extra_not)
                    cand.append({"score": sc, "rank": sc + 0.01 * (min(snr, 35) - 25), "seg": seg, "dur": (e - s) / SR,
                                 "where": f"{o['title'][5:40]} @{s / SR:.1f}s", "top": top, "snr": snr, "file": o["title"], "iv": (s, e)})
                kept: list[dict] = []
                for c in sorted(cand, key=lambda c: -c["rank"]):
                    size = lambda d: 0 if d < 0.7 else 1 if d < 1.2 else 2
                    if all(size(c["dur"]) != size(k["dur"]) or overlap(c["iv"], k["iv"]) < 0.3 for k in kept):
                        kept.append(c)
                res += kept
        return sorted(res, key=lambda c: -c["rank"])

    for kind, sp in SPECIES.items():
        pool = [c for c in cuts(sp["src"], sp["cls"], sp.get("not", [])) if c["score"] > 0.05]
        log(f"== {kind}: {len(pool)} usable calls")
        for c in pool[:12]:
            log(f"   {c['score']:.2f} {c['dur']:4.2f}s {c['snr']:3.0f} dB top={c['top']} | {c['where']}")
        if len(pool) < 6:
            log(f"!! {kind}: too few clear calls")
            continue
        used: list[dict] = []

        def free(c: dict) -> bool:
            return all(u["file"] != c["file"] or overlap(u["iv"], c["iv"]) < 0.3 for u in used)

        def pick(lo: float, hi: float, n: int = 2, among: list[dict] | None = None) -> list[dict]:
            """The best n unused calls lo..hi seconds long (any unused ones if too few, then any at all)."""
            among = pool if among is None else among
            got = [c for c in among if lo <= c["dur"] <= hi and free(c)][:n]
            got += [c for c in among if c not in got and free(c)][: n - len(got)]
            got += [c for c in among if c not in got][: n - len(got)]
            used.extend(got)
            return got

        clips: dict[str, list[tuple[np.ndarray, str]]] = {}
        clips["call"] = [(shape(c["seg"]), c["where"]) for c in pick(0.2, 0.9)]
        clips["happy"] = [(shape(c["seg"], 1.04), c["where"]) for c in pick(0.4, 1.4)]
        clips["sad"] = [(shape(c["seg"], 0.86, 3500), c["where"] + " (lowered)") for c in pick(0.4, 1.6)]
        clips["sleep"] = [(shape(c["seg"], 0.8, 2200), c["where"] + " (lowered, muffled)") for c in pick(0.4, 1.6)]
        gap = np.zeros(int(0.07 * SR), dtype=np.float32)
        sh = pick(0.18, 0.7, 4)
        clips["play"] = [(np.concatenate([shape(a["seg"], 1.06), gap, shape(b["seg"], 1.12)]), f"{a['where']} + {b['where']}")
                         for a, b in ((sh[0], sh[1 % len(sh)]), (sh[2 % len(sh)], sh[3 % len(sh)]))]
        if sp["cheer_src"]:
            crow = [c for c in cuts(sp["cheer_src"], sp["cls"] + (["Crowing, cock-a-doodle-doo"] if kind == "chicken" else []), sp.get("not", [])) if c["score"] > 0.05]
            ch = pick(0.6, 2.6, among=sorted(crow, key=lambda c: -c["dur"]))
        else:
            ch = pick(1.0, 2.6)
        clips["cheer"] = [(shape(c["seg"]), c["where"]) for c in ch]
        chew = []
        for o in find(sp["eat"]):
            if kind == "chicken":  # hungry hens' quick clucks, a little brisker
                eat = [c for c in cuts([sp["eat"]], sp["cls"]) if c["score"] > 0.05]
                chew = [(shape(c["seg"], 1.08), c["where"]) for c in pick(0.3, 0.9, among=eat)]
            else:  # chewing is steady: the two 1.2 s stretches with the most going on
                y = load(os.path.join(base, o["file"]))
                win = int(1.2 * SR)
                starts = sorted(range(0, len(y) - win, win // 2), key=lambda s: -float(np.sqrt((y[s:s + win] ** 2).mean())))[:2]
                chew = [(shape(y[s:s + win], 0.92 if kind == "sheep" else 1.15), f"{o['title'][5:40]} @{s / SR:.1f}s (chewing)") for s in starts]
        if not chew:  # no feeding recording: short, soft calls, a little brisker (pecking clucks, munching murmurs)
            chew = [(shape(c["seg"], 1.08), c["where"] + " (brisker)") for c in pick(0.2, 0.7)]
        if not chew:
            log(f"!! {kind}: no eating sound (is {sp['eat']} downloaded?)")
        clips["eat"] = chew
        for ev, cl in clips.items():
            for n, (seg, where) in enumerate(cl[:2], 1):
                sf.write(f"{out}/{kind}_{ev}_{n}.wav", seg, SR, subtype="FLOAT")
                log(f"   {kind}_{ev}_{n}: {len(seg) / SR:.2f}s from {where}")
    rep.close()


if __name__ == "__main__":
    main()
