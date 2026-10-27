import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] || 'docs/figures';
fs.mkdirSync(outDir, { recursive: true });

const FONT = 'Segoe UI, Arial, Helvetica, sans-serif';
const STROKE = '#33506e';
const ACCENT = '#2e5a88';
const INK = '#16232f';
const SOFT = '#5b6b7c';
const FILL = '#f5f8fb';

const head = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${STROKE}"/>
  </marker>
</defs>
<rect width="${w}" height="${h}" fill="#ffffff"/>`;

const label = (x, y, text, size = 18, anchor = 'middle', fill = INK, weight = 'normal', style = '') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}"${style ? ` font-style="${style}"` : ''}>${text}</text>`;

/* ---------------------------------------------------------------- figure 1 */
function fig1() {
  const w = 1000, h = 400;
  const r = 44, y = 190;
  const states = [
    { id: 'q0', x: 130 },
    { id: 'q1', x: 370 },
    { id: 'q2', x: 610 },
    { id: 'q3', x: 850 },
  ];
  const circle = (s, accept) => {
    const base = `<circle cx="${s.x}" cy="${y}" r="${r}" fill="${FILL}" stroke="${STROKE}" stroke-width="2"/>`;
    const inner = accept ? `<circle cx="${s.x}" cy="${y}" r="${r - 7}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>` : '';
    return base + inner + label(s.x, y + 8, s.id, 22);
  };
  const edge = (x1, x2, text) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>` +
    `<rect x="${(x1 + x2) / 2 - 11}" y="${y - 34}" width="22" height="22" fill="#ffffff"/>` +
    label((x1 + x2) / 2, y - 18, text, 19);

  const selfLoop = (cx, text) => {
    const x1 = cx - 24, x2 = cx + 24;
    return `<path d="M${x1},${y - r + 12} C${cx - 56},${y - 128} ${cx + 56},${y - 128} ${x2},${y - r + 12}" fill="none" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>` +
      `<rect x="${cx - 12}" y="${y - 124}" width="24" height="22" fill="#ffffff"/>` +
      label(cx, y - 108, text, 19);
  };

  return `${head(w, h)}
<line x1="30" y1="${y}" x2="${78}" y2="${y}" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>
${edge(174, 322, 'a')}
${edge(414, 562, 'b')}
${edge(654, 802, 'b')}
${selfLoop(130, 'b')}
${selfLoop(370, 'a')}
${selfLoop(610, 'a')}
<path d="M828,222 C700,320 520,320 392,222" fill="none" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>
<rect x="592" y="262" width="36" height="24" fill="#ffffff"/>
${label(610, 280, 'a', 19)}
<path d="M812,232 C640,392 280,392 122,224" fill="none" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>
<rect x="592" y="356" width="36" height="24" fill="#ffffff"/>
${label(610, 374, 'b', 19)}
${states.map((s, i) => circle(s, i === 3)).join('\n')}
</svg>`;
}

/* ---------------------------------------------------------------- figure 2 */
function fig2() {
  const w = 1000, h = 260;
  const top = 90, bot = 154;
  const xs = [120, 300, 420, 880];
  const seg = (a, b, fill) =>
    `<rect x="${a}" y="${top}" width="${b - a}" height="${bot - top}" fill="${fill}" stroke="${STROKE}" stroke-width="1.6"/>`;
  return `${head(w, h)}
${label(500, 40, 's = xyz, with |s| ≥ p and xyⁱz ∈ L for every i ≥ 0', 20, 'middle', SOFT)}
${seg(xs[0], xs[1], '#e8eef5')}
${seg(xs[1], xs[2], '#d6e2ee')}
${seg(xs[2], xs[3], '#eef3f8')}
${label(210, 130, 'x', 26)}
${label(360, 130, 'y', 26)}
${label(650, 130, 'z', 26)}
${label(360, 80, '|y| ≥ 1', 17, 'middle', SOFT)}
<path d="M${xs[0]},178 v12 H${xs[2]} v-12" fill="none" stroke="${STROKE}" stroke-width="1.6"/>
${label(270, 216, '|xy| ≤ p', 19)}
${label(500, 248, 'the loop y can be repeated or removed without leaving L', 16, 'middle', SOFT)}
</svg>`;
}

/* ---------------------------------------------------------------- figure 3 */
function fig3() {
  const w = 1000, h = 320;
  const rows = [
    ['Views', 'workbench, construction view, rule drawer'],
    ['Domain engines', 'regex, automata, grammars, Arden, closure, pumping'],
    ['Lexical analyzer', 'rule compilation, longest match, trace, diagnostics'],
    ['Shared model', 'automata, grammars, tokens, rules, projects'],
  ];
  const bx = 110, bw = 780, bh = 48, gap = 14, y0 = 34;
  const boxes = rows.map(([title, desc], i) => {
    const y = y0 + i * (bh + gap);
    return `<rect x="${bx}" y="${y}" width="${bw}" height="${bh}" fill="${FILL}" stroke="#b9c7d6" stroke-width="1.4" rx="4"/>
<rect x="${bx}" y="${y}" width="6" height="${bh}" fill="${ACCENT}" rx="2"/>
${label(bx + 26, y + 31, title, 19, 'start', INK, '600')}
${label(bx + 210, y + 31, desc, 17, 'start', SOFT)}`;
  });
  return `${head(w, h)}
${boxes.join('\n')}
${label(500, 300, 'browser only — no server, no database, no network after load', 16, 'middle', SOFT)}
</svg>`;
}

/* ---------------------------------------------------------------- figure 4 */
function fig4() {
  const w = 1000, h = 250;
  const stages = ['Regular\nexpression', 'Syntax\ntree', 'NFA with\nε-moves', 'Deterministic\nautomaton', 'Minimal\nautomaton'];
  const ops = ['parse', 'Thompson', 'subset', 'minimize'];
  const bw = 150, bh = 74, y = 70;
  const xs = [20, 215, 410, 605, 800];
  const boxes = stages.map((s, i) => {
    const [l1, l2] = s.split('\n');
    return `<rect x="${xs[i]}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${FILL}" stroke="${STROKE}" stroke-width="1.8"/>
${label(xs[i] + bw / 2, y + 32, l1, 17)}
${label(xs[i] + bw / 2, y + 55, l2, 17)}`;
  });
  const arrows = xs.slice(0, 4).map((x, i) => {
    const x1 = x + bw, x2 = xs[i + 1];
    return `<line x1="${x1 + 3}" y1="${y + bh / 2}" x2="${x2 - 3}" y2="${y + bh / 2}" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>
${label((x1 + x2) / 2, y + bh + 38, ops[i], 16, 'middle', SOFT)}`;
  });
  return `${head(w, h)}
${boxes.join('\n')}
${arrows.join('\n')}
</svg>`;
}

/* ---------------------------------------------------------------- figure 5 */
function fig5() {
  const w = 1000, h = 320;
  const boxes = [
    ['Source text', 'and ordered rules'],
    ['Test every enabled', 'rule at the offset'],
    ['Keep longest match;', 'priority breaks ties'],
    ['Emit token, trace', 'row, diagnostics'],
  ];
  const bw = 210, bh = 76, y = 70;
  const xs = [25, 265, 505, 745];
  const rects = boxes.map(([l1, l2], i) =>
    `<rect x="${xs[i]}" y="${y}" width="${bw}" height="${bh}" rx="6" fill="${FILL}" stroke="${STROKE}" stroke-width="1.8"/>
${label(xs[i] + bw / 2, y + 34, l1, 17)}
${label(xs[i] + bw / 2, y + 58, l2, 17)}`,
  );
  const arrows = xs.slice(0, 3).map((x, i) => {
    const x1 = x + bw, x2 = xs[i + 1];
    return `<line x1="${x1 + 3}" y1="${y + bh / 2}" x2="${x2 - 3}" y2="${y + bh / 2}" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>`;
  });
  return `${head(w, h)}
${rects.join('\n')}
${arrows.join('\n')}
<path d="M850,152 L850,246 L370,246 L370,158" fill="none" stroke="${STROKE}" stroke-width="2" marker-end="url(#ah)"/>
${label(610, 285, 'advance the offset; repeat until the end of the input', 17, 'middle', SOFT)}
</svg>`;
}

const figures = [
  ['fig1-dfa', fig1()],
  ['fig2-pumping', fig2()],
  ['fig3-architecture', fig3()],
  ['fig4-pipeline', fig4()],
  ['fig5-scan-loop', fig5()],
];

for (const [name, svg] of figures) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
svg{display:block}
</style></head><body>${svg}</body></html>`;
  fs.writeFileSync(path.join(outDir, `${name}.html`), html);
  fs.writeFileSync(path.join(outDir, `${name}.svg`), svg);
  console.log(`wrote ${name}.html/.svg`);
}
