/**
 * Pixel-art toolbar icons, drawn from the prototype's ASCII sprites so the UI keeps the
 * board-game-box charm of the 2D version.
 */
const IP: Record<string, string> = {
  y: '#f2b632', g: '#5fa65a', G: '#9bd27a', b: '#7a4b2a', r: '#d9533c', k: '#3a2418', w: '#ffffff', s: '#9aa7b5',
  u: '#4f8fd1', U: '#9cc8ef', h: '#f0c39a', H: '#d39d72', t: '#e2b45a', T: '#b8862f',
};

const ICON_ROWS: Record<string, string[]> = {
  hand: ['....h.h.....', '...hh.hh.h..', '...hh.hh.hh.', '.h.hh.hh.hh.', '.hhhhhhhhhh.', '.hhhhhhhhhH.', '..hhhhhhhH..', '..hhhhhhhH..', '...hhhhhH...', '...HHHHHH...'],
  raise: ['.....yy.....', '....yyyy....', '...yyyyyy...', '.....yy.....', '.....yy.....', '............', '....GGGG....', '..GGggggGG..', '.Gggggggggg.', 'Gggggggggggg', 'bbbbbbbbbbbb'],
  lower: ['.....yy.....', '.....yy.....', '...yyyyyy...', '....yyyy....', '.....yy.....', '............', 'GGGG....GGGG', 'gggGG..GGggg', 'gggggGGggggg', 'gggggggggggg', 'bbbbbbbbbbbb'],
  build: ['.....bb.....', '....tttt....', '...tttttt...', '..ttttttTT..', '.tttttttTTT.', 'tttttttTTTTT', '..bbbbbbbb..', '..bbbkkbbb..', '..bbbkkbbb..', 'gggggggggggg'],
  totem: ['.....r......', '....ryr.....', '.....r......', '....bbb.....', '...bkbkb....', '...bbbbb....', '....bkb.....', '....bbb.....', '.....b......', '.....b......', '..gggggggg..'],
  bloom: ['....GGGG....', '..GGgGGgGG..', '.GgggGggrgG.', '.Ggrggggggg.', '..gggggrg...', '...gggggg...', '.....bb.....', '..r..bb..y..', '.rgr.bb.yGy.', '..g..bb..g..', 'gggggggggggg'],
  flat: ['............', 'y..........y', 'yyyyyyyyyyyy', 'y..........y', '............', 'GGGGGGGGGGGG', 'gggggggggggg', 'gggggggggggg', 'bbbbbbbbbbbb', 'bbbbbbbbbbbb'],
  rain: ['...wwww.....', '..wwwwwww...', '.wwwwwwwwww.', 'wwwwwwwwwwww', '.ssssssssss.', '............', '.u..u..u..u.', 'u..u..u..u..', '............', '..u..u..u..u', '.u..u..u..u.'],
  isle: ['.....yy.....', '....yyyy....', '...GGGGGG...', '..GggggggG..', '.Gggggggggb.', 'uuuggggggguu', 'uUuubbbbbuUu', 'uuuuuuuuuuuu', 'uUuuuUuuuUuu', 'uuuuuuuuuuuu'],
  fest: ['.....k......', '.....k......', '....rrr.....', '...ryyyr....', '..ryyyyyr...', '..ryyyyyr...', '..ryyyyyr...', '...ryyyr....', '....rrr.....', '.....y......', '....y.y.....'],
};

function spr(rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows.length;
  const x = c.getContext('2d')!;
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) {
      const col = pal[r[i]!];
      if (col) {
        x.fillStyle = col;
        x.fillRect(i, j, 1, 1);
      }
    }
  });
  return c;
}

const cache: Record<string, string> = {};
/** Data URL for a tool icon. */
export function icon(id: string): string {
  if (!cache[id]) {
    const rows = ICON_ROWS[id];
    cache[id] = rows ? spr(rows, IP).toDataURL() : '';
  }
  return cache[id]!;
}
