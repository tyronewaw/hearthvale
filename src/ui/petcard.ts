import { HABITS, HNAME, PETS, STAGES, TRICK_NAME, alignment, petStage, type Leash, type PetKind } from '../sim/pet';
import { BALANCE } from '../sim/balance';
import type { State } from '../sim/world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** The prototype's pixel pets, used for portraits on the pet card and the choose screen. */
const PETART: Record<PetKind, { rows: string[]; p: Record<string, string>; legs: [number, number][]; legC: string; ol: string }> = {
  sheep: {
    rows: ['....WwwWww......', '..WwwwwwwwwW....', '.WwwwwwwwwwwWkK.', 'WwwwwwwwwwwwkkkK', 'wwwwwwwwwwwwkekk', 'wWwwwwwwwwwkkkkk', 'wwwwwwwwwWwwkkk.', '.wwwwwwwwwwwk...', '..WwwwwwwwwW....', '...wwwwwwww.....'],
    p: { w: '#f6f2ea', W: '#ddd5c6', k: '#4a3a34', K: '#6a5048', e: '#ffffff' }, legs: [[3, 1], [5, 1], [9, 1], [11, 1]], legC: '#4a3a34', ol: '#7d7266',
  },
  chicken: {
    rows: ['........rr..', '.......rrrr.', '......wwwww.', '......wwewwy', '......wwwwyy', '.w....wwwwr.', 'ww...wwwwww.', 'wwwwwwwwwww.', 'wWWwwwwwwww.', '.wWWWwwwwww.', '..wwwwwwww..', '....wwwww...'],
    p: { w: '#fff6e6', W: '#e3cfa8', r: '#e0533f', y: '#f2a23a', e: '#2a1a12' }, legs: [[5, 1], [7, 1]], legC: '#f2a23a', ol: '#8a6e4e',
  },
  monkey: {
    rows: ['.....bbbb.....', '....bbbbbb....', '...obttttbo...', '....tetett....', '....tttttt....', '.....tnnt.....', '......bb......', '....bbbbbb....', '...bbttttbb...', '..hbbttttbbh..', '..h.bttttb.h..', 'b...bbbbbb....', '.bbb..........'],
    p: { b: '#8b5a33', t: '#e6c095', e: '#2a1a12', n: '#5a3424', o: '#e6c095', h: '#e6c095' }, legs: [[4, 2], [8, 2]], legC: '#7a4a28', ol: '#3e2414',
  },
};

const portraits: Partial<Record<PetKind, string>> = {};
/** A crisp, outlined, scaled-up pixel portrait (data URL). */
export function petPortrait(k: PetKind): string {
  if (portraits[k]) return portraits[k]!;
  const A = PETART[k], h = A.rows.length, w = Math.max(...A.rows.map((r) => r.length)), sc = 4;
  const raw = document.createElement('canvas');
  raw.width = w;
  raw.height = h + 2;
  const x = raw.getContext('2d')!;
  A.rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const col = A.p[r[i]!];
      if (col) {
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
  });
  x.fillStyle = A.legC;
  for (const [lx, lw] of A.legs) x.fillRect(lx, h, lw, 2);
  const out = document.createElement('canvas');
  out.width = (w + 2) * sc;
  out.height = (h + 4) * sc;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  const d = x.getImageData(0, 0, w, h + 2).data, on = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h + 2 && d[(j * w + i) * 4 + 3]! > 40;
  o.fillStyle = A.ol;
  for (let j = -1; j <= h + 2; j++)
    for (let i = -1; i <= w; i++)
      if (!on(i, j) && (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1))) o.fillRect((i + 1) * sc, (j + 1) * sc, sc, sc);
  o.drawImage(raw, sc, sc, w * sc, (h + 2) * sc);
  return (portraits[k] = out.toDataURL());
}

export interface PetHandlers {
  choose(kind: PetKind, name: string): void;
  leash(mode: Leash): void;
  send(): void;
  feed(): void;
  find(): void;
}

/** The pet card (right side) and the choose-your-pet screen, ported from the prototype. */
export class PetCard {
  private pickKind: PetKind = 'sheep';
  private t = 0;

  constructor(private h: PetHandlers) {
    $('lFree').onclick = () => this.h.leash('free');
    $('lFollow').onclick = () => this.h.leash('follow');
    $('lStay').onclick = () => this.h.leash('stay');
    $('bSend').onclick = () => this.h.send();
    $('bFeed').onclick = () => this.h.feed();
    $('bFind').onclick = () => this.h.find();
    $('petHead').onclick = () => $('petp').classList.toggle('open');
    $('bChoose').onclick = () => {
      const nm = ($<HTMLInputElement>('petNameIn').value || PETS[this.pickKind].def).trim().slice(0, 14);
      $('choose').classList.remove('show');
      this.h.choose(this.pickKind, nm);
    };
  }

  openChoose(): void {
    const cards = $('petCards');
    cards.innerHTML = (Object.keys(PETS) as PetKind[]).map((k) =>
      `<button class="pc${k === this.pickKind ? ' on' : ''}" data-k="${k}"><img alt="" src="${petPortrait(k)}"><b>${PETS[k].name}</b>` +
      PETS[k].traits.map((t) => `<span>${t}</span>`).join('') + '</button>',
    ).join('');
    cards.querySelectorAll<HTMLButtonElement>('.pc').forEach((b) => {
      b.onclick = () => {
        const old = PETS[this.pickKind].def, inp = $<HTMLInputElement>('petNameIn');
        this.pickKind = b.dataset.k as PetKind;
        if (!inp.value || inp.value === old) inp.value = PETS[this.pickKind].def;
        this.openChoose();
      };
    });
    $('choose').classList.add('show');
  }

  setSending(on: boolean): void {
    $('bSend').classList.toggle('on', on);
  }

  /** Refresh the card (throttled). */
  update(S: State, rdt: number): void {
    if ((this.t -= rdt) > 0) return;
    this.t = 0.25;
    const P = S.pet;
    $('petp').classList.toggle('show', !!P);
    if (!P) return;
    $<HTMLImageElement>('petImg').src = petPortrait(P.kind);
    $('petName').textContent = P.name;
    const n = P.need, A = P.act;
    $('petMood').textContent = (n.food < 30 ? 'Hungry' : n.energy < 22 ? 'Sleepy' : n.fun < 25 ? 'Bored' : P.love > 75 ? 'Adores you' : P.love < 30 ? 'Sulking' : 'Content') +
      ' · ' + HNAME[A ? A.id : 'wander'].toLowerCase();
    const al = alignment(P);
    $('petAlign').textContent = al > 0.6 ? 'Nature: kind' : al < -0.4 ? 'Nature: cheeky' : 'Nature: balanced';
    const st = petStage(P), nx = [BALANCE.petYoung, BALANCE.petGrand][st];
    $('petStage').textContent = STAGES[st] + ' ' + PETS[P.kind].name.toLowerCase();
    $('petXp').textContent = nx ? `grows at ${nx}` : 'fully grown';
    $('pnX').style.width = (nx ? Math.min(100, (P.xp / nx) * 100) : 100) + '%';
    $('pnF').style.width = n.food + '%';
    $('pnE').style.width = n.energy + '%';
    $('pnU').style.width = n.fun + '%';
    $('pnL').style.width = P.love + '%';
    for (const [id, m] of [['lFree', 'free'], ['lFollow', 'follow'], ['lStay', 'stay']] as const) $(id).classList.toggle('on', P.mode === m);
    $('habits').innerHTML = HABITS.map((h) => {
      const lv = Math.round(Math.min(5, Math.max(0.1, P.w[h])));
      return `<div class="habit"><span>${HNAME[h]}</span><span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span></div>`;
    }).join('');
    $('petTricks').textContent = P.tricks.length
      ? 'Tricks: ' + P.tricks.map((t) => TRICK_NAME[t]).join(', ')
      : 'No tricks yet. Cast blessings near it to teach some';
  }
}
