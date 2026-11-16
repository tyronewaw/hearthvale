import { BALANCE } from '../sim/balance';
import { STRUCTS, STRUCT_KINDS, TOOLS, type StructKind, type ToolId } from '../sim/defs';
import { DAY, SEASONS, season, tod, type State } from '../sim/world';
import { icon, structIcon } from './icons';
import { QUESTS } from '../sim/quests';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface UiHandlers {
  pickTool(id: ToolId): void;
  pickStruct(k: StructKind): void;
  togglePause(): boolean;
  cycleSpeed(): number;
  newWorld(): void;
  /** The welcome screen was dismissed (a new player chooses their pet next). */
  helpClosed(): void;
  toggleSound(): boolean;
}

/** The HTML overlay: HUD, toolbar, toasts, tooltips and modals. Reads sim state, never writes it. */
export class Ui {
  private toastQ: string[] = [];
  private toastOn = false;
  private hudT = 0;

  constructor(private h: UiHandlers) {
    $('bPause').onclick = () => {
      $('bPause').textContent = this.h.togglePause() ? 'Play' : 'Pause';
    };
    $('bSpeed').onclick = () => {
      $('bSpeed').textContent = this.h.cycleSpeed() + '×';
    };
    $('bHelp').onclick = () => this.toggleHelp(true);
    $('bSound').onclick = () => this.setSound(this.h.toggleSound());
    $('bKeep').onclick = () => $('win').classList.remove('show');
    // Offer to install the game as an app when the browser allows it (Chrome/Edge on desktop).
    let deferred: (Event & { prompt(): Promise<void> }) | null = null;
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e as Event & { prompt(): Promise<void> };
      $('bInstall').hidden = false;
    });
    $('bInstall').onclick = () => {
      deferred?.prompt();
      deferred = null;
      $('bInstall').hidden = true;
    };
    addEventListener('appinstalled', () => ($('bInstall').hidden = true));
    $('quest').onclick = () => $('quest').classList.toggle('open');
    $('bStart').onclick = () => {
      this.toggleHelp(false);
      this.h.helpClosed();
    };
    $('bNew').onclick = () => $('conf').classList.add('show');
    $('bNo').onclick = () => $('conf').classList.remove('show');
    $('bYes').onclick = () => {
      $('conf').classList.remove('show');
      this.h.newWorld();
    };
    $('bMenu').onclick = () => {
      const t = $('top');
      t.classList.toggle('open');
      $('bMenu').setAttribute('aria-expanded', String(t.classList.contains('open')));
    };
    const setLayout = () => {
      const coarse = matchMedia('(pointer: coarse)').matches;
      document.body.classList.toggle('m', innerWidth < 760 || (coarse && innerHeight < 520));
    };
    setLayout();
    addEventListener('resize', setLayout);
  }

  toggleHelp(show?: boolean): void {
    $('help').classList.toggle('show', show);
  }

  setSound(on: boolean): void {
    $('bSound').textContent = on ? 'Sound on' : 'Sound off';
  }

  /** The quest panel: the current quest, or all done. */
  drawQuest(S: State): void {
    const done = S.q >= QUESTS.length, Q = QUESTS[Math.min(S.q, QUESTS.length - 1)]!;
    $('qn').textContent = done ? 'All quests done' : `Quest ${S.q + 1} of ${QUESTS.length}`;
    $('qt').textContent = done ? 'The valley sings' : Q.t;
    $('qx').textContent = done ? 'Your world is yours to keep tending.' : Q.x;
  }

  showWin(pop: number, day: number): void {
    $('winTxt').textContent = `${pop} villagers now call Hearthvale home, on day ${day}. The little world is yours to keep tending.`;
    $('win').classList.add('show');
  }

  setPaused(p: boolean): void {
    $('bPause').textContent = p ? 'Play' : 'Pause';
  }

  drawBar(tool: ToolId, bsel: StructKind, best: number): void {
    $('bar').innerHTML = TOOLS.map((t, i) => {
      const lk = best < t.need;
      const cost = lk ? 'at ' + t.need + ' villagers' : t.cost ? t.cost + ' faith' : t.id === 'build' ? 'wood' : 'free';
      return `<button class="tool${t.id === tool ? ' on' : ''}${lk ? ' locked' : ''}" id="t-${t.id}" title="${t.name} (key ${(i + 1) % 10})">` +
        `<img alt="" src="${icon(t.id)}"><span>${t.name}</span><em>${cost}</em></button>`;
    }).join('');
    for (const t of TOOLS) $('t-' + t.id).onclick = () => this.h.pickTool(t.id);
    const sub = $('sub');
    sub.classList.toggle('show', tool === 'build');
    sub.innerHTML = STRUCT_KINDS.map((k) =>
      `<button class="tool${k === bsel ? ' on' : ''}" id="s-${k}"><img alt="" src="${structIcon(k)}"><span>${STRUCTS[k].name}</span>` +
      `<em>${STRUCTS[k].wood ? STRUCTS[k].wood + ' wood' : 'free'}</em></button>`,
    ).join('');
    for (const k of STRUCT_KINDS) $('s-' + k).onclick = () => this.h.pickStruct(k);
    const T = TOOLS.find((t) => t.id === tool)!;
    $('desc').textContent = tool === 'build'
      ? `Build ${STRUCTS[bsel].name} · ${STRUCTS[bsel].wood ? STRUCTS[bsel].wood + ' wood' : 'free'}. ${STRUCTS[bsel].desc}`
      : `${T.name} · ${T.cost ? T.cost + ' faith' : 'free'}. ${best < T.need ? 'Unlocks at ' + T.need + ' villagers.' : T.desc}`;
  }

  /** Refresh the HUD numbers (throttled to 4 Hz). */
  hud(S: State, rdt: number): void {
    if ((this.hudT -= rdt) > 0) return;
    this.hudT = 0.25;
    $('hf').textContent = String(Math.floor(S.faith));
    $('hfo').textContent = Math.floor(S.food) + (S.food <= 0 ? ' (hungry)' : '');
    $('hwo').textContent = String(Math.floor(S.wood));
    $('hp').textContent = String(S.popNow);
    $('hpb').style.width = Math.min(100, (S.popNow / BALANCE.goal) * 100) + '%';
    $('hpm').title = `Progress to ${BALANCE.goal} villagers`;
    $('hh').textContent = String(S.homes.length);
    $('hw').textContent = String(S.vills.filter((v) => v.type === 'settler').length);
    const t = tod(S.t);
    $('hd').textContent = `Day ${Math.floor(S.t / DAY) + 1}`;
    $('hs').textContent = `${SEASONS[season(S.t)]}, ${t < 0.22 || t > 0.8 ? 'night' : t < 0.5 ? 'morning' : t < 0.68 ? 'afternoon' : 'evening'}`;
  }

  /** Show a tooltip near the pointer, or hide it with html = null. */
  tip(html: string | null, x = 0, y = 0): void {
    const el = $('tip');
    if (!html) {
      el.style.display = 'none';
      return;
    }
    el.innerHTML = html;
    el.style.display = 'block';
    el.style.left = Math.max(8, Math.min(innerWidth - Math.min(290, innerWidth - 16), x + 22)) + 'px';
    el.style.top = Math.max(8, y - 80) + 'px';
  }

  toast(m: string): void {
    if (this.toastQ.length > 4) return;
    this.toastQ.push(m);
    if (!this.toastOn) this.nextToast();
  }

  private nextToast(): void {
    const el = $('toast');
    const m = this.toastQ.shift();
    if (m === undefined) {
      this.toastOn = false;
      el.classList.remove('show');
      return;
    }
    this.toastOn = true;
    el.textContent = m;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => this.nextToast(), 380);
    }, 2600);
  }

  stats(text: string | null): void {
    const el = $('stats');
    el.classList.toggle('show', text !== null);
    if (text !== null) el.textContent = text;
  }

  loaded(): void {
    $('loading').classList.add('done');
  }
}
