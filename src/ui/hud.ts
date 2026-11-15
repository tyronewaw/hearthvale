import { TOOLS, type ToolId } from '../sim/sim';
import { DAY, SEASONS, season, tod, type State } from '../sim/world';
import { icon } from './icons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface UiHandlers {
  pickTool(id: ToolId): void;
  togglePause(): boolean;
  cycleSpeed(): number;
  newWorld(): void;
}

/** The HTML overlay: HUD, toolbar, toasts and modals. Reads sim state, never writes it. */
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
    $('bStart').onclick = () => this.toggleHelp(false);
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

  setPaused(p: boolean): void {
    $('bPause').textContent = p ? 'Play' : 'Pause';
  }

  drawBar(tool: ToolId): void {
    const bar = $('bar');
    bar.innerHTML = TOOLS.map((t, i) =>
      `<button class="tool${t.id === tool ? ' on' : ''}" id="t-${t.id}" title="${t.name} (key ${i + 1})">` +
      `<img alt="" src="${icon(t.id)}"><span>${t.name}</span><em>${t.cost ? t.cost + ' faith' : 'free'}</em></button>`,
    ).join('');
    for (const t of TOOLS) $('t-' + t.id).onclick = () => this.h.pickTool(t.id);
    const T = TOOLS.find((t) => t.id === tool)!;
    $('desc').textContent = `${T.name} · ${T.cost ? T.cost + ' faith' : 'free'}. ${T.desc}`;
  }

  /** Refresh the HUD numbers (throttled to 4 Hz). */
  hud(S: State, rdt: number): void {
    if ((this.hudT -= rdt) > 0) return;
    this.hudT = 0.25;
    $('hf').textContent = String(Math.floor(S.faith));
    $('hfo').textContent = String(Math.floor(S.food));
    $('hwo').textContent = String(Math.floor(S.wood));
    const t = tod(S.t);
    $('hd').textContent = `Day ${Math.floor(S.t / DAY) + 1}`;
    $('hs').textContent = `${SEASONS[season(S.t)]}, ${t < 0.22 || t > 0.8 ? 'night' : t < 0.5 ? 'morning' : t < 0.68 ? 'afternoon' : 'evening'}`;
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
