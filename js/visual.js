// 그림·색으로 보여주는 조각들: 색 견본, 방울 그림, 4단 단면도, 결 무늬 예시 그림, 토너 단계
import { esc } from './util.js';
import { hexToRgb, rgbToHex, lin, unlin, isDark, tonerLayer, afterClear } from './color.js';

const shade = (hex, k) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v) => v * k)));
const tint = (hex, k) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v) => v + (1 - v) * k)));

export function swatch(hex, label = '', sub = '', cls = '') {
  if (!hex) return '';
  return `<div class="sw ${cls}"><i style="background:${esc(hex)}"></i>${label ? `<b>${esc(label)}</b>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
}

// 목표색 → 바탕색 (+ 마감 후)
export function swatchFlow(items) {
  return `<div class="sw-flow">${items
    .filter((x) => x && x.hex)
    .map((x, i) => `${i ? '<span class="arr">→</span>' : ''}${swatch(x.hex, x.label, x.sub)}`)
    .join('')}</div>`;
}

// 방울 수 그림: ● 하나 = 1방울, 반쪽 = 0.5, 0.1~0.3은 이쑤시개
export function drops(hex, n) {
  const style = `--c:${esc(hex)};--e:${isDark(hex) ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.18)'}`;
  if (n > 0 && n < 0.5) return `<span class="drops" style="${style}"><svg class="pick" viewBox="0 0 40 10" aria-label="이쑤시개 끝"><path d="M2 5h30" stroke="#c8a676" stroke-width="2.4" stroke-linecap="round"/><path d="M32 5l6 0" stroke="#c8a676" stroke-width="1.2" stroke-linecap="round"/><circle cx="37" cy="5" r="2.6" fill="${esc(hex)}"/></svg></span>`;
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  const shown = Math.min(full, 12);
  return `<span class="drops" style="${style}">${'<i></i>'.repeat(shown)}${half ? '<i class="h"></i>' : ''}${full > 12 ? `<em>+${full - 12}</em>` : ''}</span>`;
}

export const fmtDrops = (n) => (n > 0 && n < 0.5 ? '이쑤시개 끝' : `${+(+n).toFixed(1)}방울`);

// 토너를 1회·2회 겹쳤을 때 예상 색
export function tonerSteps(baseHex, toner, passes = 2) {
  const cells = [swatch(baseHex, '바탕', '')];
  let cur = baseHex;
  for (let i = 1; i <= passes; i++) {
    cur = tonerLayer(cur, toner.hex, 1);
    cells.push(swatch(cur, `${i}회`, ''));
  }
  return `<div class="sw-flow small">${cells.join('<span class="arr">→</span>')}</div>`;
}

// 4단 레시피 마루 단면 그림
export function layerDiagram({ putty = '#6fb6e6', base, grain, toner, finishName = '마감' }) {
  const b = base || '#d9b48a';
  const g = grain || shade(b, 0.45);
  const t = toner ? tonerLayer(b, toner, 1) : b;
  const f = afterClear(t);
  const rows = [
    { c: 'rgba(255,255,255,.6)', s: '#cfd6de', n: '④ 투명 마감', d: finishName },
    { c: t, n: '③ 토너', d: '얇게 1~2회' },
    { c: b, n: '② 결 그리기', d: '결펜·세필붓', grain: true },
    { c: b, n: '① 아크릴 바탕', d: '목표보다 한 톤 밝게' },
    { c: putty, n: '퍼티', d: '바탕으로 완전히 덮기' },
  ].map((r, i) => ({ ...r, y: 6 + i * 26, h: 26 }));
  return `<svg class="layers" viewBox="0 0 300 146" role="img" aria-label="4단 레시피 단면 그림">
    <defs><clipPath id="lc"><rect x="4" y="6" width="130" height="138" rx="8"/></clipPath></defs>
    <g clip-path="url(#lc)">
      ${rows.map((r) => `<rect x="4" y="${r.y}" width="130" height="${r.h}" fill="${r.c}" ${r.s ? `stroke="${r.s}"` : ''}/>`).join('')}
      ${[12, 38, 66, 92, 116].map((x, i) => `<path d="M${x} 62 q5 6 ${10 + i} 12" stroke="${g}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join('')}
      <rect x="4" y="136" width="130" height="8" fill="${shade(f, 0.6)}"/>
    </g>
    ${rows.map((r) => `<line x1="138" y1="${r.y + 13}" x2="148" y2="${r.y + 13}" stroke="currentColor" opacity=".35"/>
      <text x="152" y="${r.y + 11}" class="lt">${esc(r.n)}</text><text x="152" y="${r.y + 23}" class="ld">${esc(r.d)}</text>`).join('')}
  </svg>`;
}

/* ---------- 결 무늬 예시 그림 ---------- */
const arrow = (x1, y1, x2, y2) =>
  `<g class="ga"><path d="M${x1} ${y1} L${x2} ${y2}"/><path d="M${x2} ${y2} l-6 -3 M${x2} ${y2} l-3 -6" transform="rotate(${(Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI - 45} ${x2} ${y2})"/></g>`;

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export function grainSvg(kind, base = '#c8955a', ink) {
  const g = ink || shade(base, 0.42);
  const lite = tint(base, 0.35);
  const R = rand(kind.length * 31 + 7);
  let body = '';
  if (kind === 'straight') {
    for (let i = 0; i < 9; i++) {
      const y = 10 + i * 9 + R() * 3;
      let x = 4;
      while (x < 156) {
        const len = 20 + R() * 40;
        body += `<path d="M${x} ${y} q${len / 2} ${R() * 2 - 1} ${len} ${R() * 1.5}" stroke="${g}" stroke-width="${0.8 + R() * 1.4}" opacity="${0.5 + R() * 0.5}"/>`;
        x += len + 4 + R() * 10;
      }
    }
    body += arrow(20, 94, 70, 94);
  } else if (kind === 'cathedral') {
    // 안쪽(작고 낮은) 산부터 바깥(크고 높은) 산으로
    for (let i = 0; i < 6; i++) {
      const w = 10 + i * 12, top = 78 - i * 12;
      body += `<path d="M${80 - w} 104 C${80 - w} ${top - 10}, ${80 + w} ${top - 10}, ${80 + w} 104" stroke="${g}" stroke-width="${2.4 - i * 0.25}" opacity="${1 - i * 0.1}"/>`;
    }
    [6, 154].forEach((x) => (body += `<path d="M${x} 4 V100" stroke="${g}" stroke-width="1" opacity=".5"/>`));
    body += `<text x="80" y="96" class="gn">1</text><text x="80" y="22" class="gn">6</text>` + arrow(80, 84, 80, 30);
  } else if (kind === 'flame') {
    for (let i = 0; i < 8; i++) body += `<path d="M4 ${10 + i * 11} H156" stroke="${g}" stroke-width="1" opacity=".55"/>`;
    for (let i = 0; i < 9; i++) {
      const x = 10 + i * 17;
      body += `<path d="M${x} 12 q8 20 0 40 q-8 20 0 40" stroke="${lite}" stroke-width="6" opacity=".55" stroke-linecap="round"/>`;
    }
    body += arrow(24, 96, 52, 70);
  } else if (kind === 'pores') {
    for (let i = 0; i < 8; i++) body += `<path d="M4 ${10 + i * 11} H156" stroke="${g}" stroke-width=".8" opacity=".4"/>`;
    for (let i = 0; i < 70; i++) {
      const x = 6 + R() * 148, y = 8 + R() * 82;
      body += `<path d="M${x} ${y} h${2 + R() * 5}" stroke="${g}" stroke-width="1.6" stroke-linecap="round"/>`;
    }
  } else if (kind === 'knot') {
    body += `<ellipse cx="80" cy="50" rx="12" ry="8" fill="${shade(base, 0.35)}"/><ellipse cx="80" cy="50" rx="17" ry="12" stroke="${g}" stroke-width="2"/>`;
    for (let i = 0; i < 6; i++) {
      const o = 18 + i * 6;
      body += `<path d="M4 ${50 - o} C50 ${50 - o}, 56 ${50 - o * 0.45}, 80 ${50 - o * 0.45 - 6} S110 ${50 - o}, 156 ${50 - o}" stroke="${g}" stroke-width="1.3" opacity=".75"/>`;
      body += `<path d="M4 ${50 + o} C50 ${50 + o}, 56 ${50 + o * 0.45}, 80 ${50 + o * 0.45 + 6} S110 ${50 + o}, 156 ${50 + o}" stroke="${g}" stroke-width="1.3" opacity=".75"/>`;
    }
  } else if (kind === 'seam') {
    body += `<rect x="0" y="0" width="160" height="50" fill="${tint(base, 0.08)}"/>`;
    for (let i = 0; i < 4; i++) body += `<path d="M4 ${10 + i * 10} H156" stroke="${g}" stroke-width=".8" opacity=".4"/><path d="M4 ${60 + i * 10} H156" stroke="${g}" stroke-width=".8" opacity=".4"/>`;
    body += `<path d="M0 50 H160" stroke="${shade(base, 0.28)}" stroke-width="2"/>`;
    body += `<rect x="20" y="53" width="120" height="9" rx="2" fill="#e9e3d6" stroke="#b9ae98"/>${[30, 50, 70, 90, 110, 130].map((x) => `<path d="M${x} 53 v4" stroke="#8b7f69"/>`).join('')}`;
  } else {
    body += `<ellipse cx="50" cy="40" rx="40" ry="22" fill="${shade(base, 0.75)}" opacity=".7"/><ellipse cx="120" cy="70" rx="34" ry="18" fill="${tint(base, 0.25)}" opacity=".7"/>`;
    for (let i = 0; i < 8; i++) body += `<path d="M4 ${10 + i * 11} H156" stroke="${g}" stroke-width=".8" opacity=".35"/>`;
  }
  return `<svg class="grain" viewBox="0 0 160 100" role="img" aria-label="결 무늬 예시"><rect width="160" height="100" fill="${esc(base)}"/><g fill="none" stroke-linecap="round">${body}</g></svg>`;
}

// 사진 위 판 번호 표시
export function markers(points, sel) {
  return points
    .map((p) => `<button class="mk ${p.no === sel ? 'on' : ''} ${p.kind === 'card' ? 'card' : ''}" data-no="${p.no}" style="left:${p.x * 100}%;top:${p.y * 100}%;--c:${esc(p.hex || '#fff')}">${p.kind === 'card' ? '기준' : p.no}</button>`)
    .join('');
}

/* ---------- 광택 그림: 바닥에 비친 천장 조명 ---------- */
const GLOSS_LOOK = {
  유광: { blur: 0.4, op: 0.95, rx: 16, ry: 5 },
  반광: { blur: 4, op: 0.6, rx: 20, ry: 7 },
  하광: { blur: 9, op: 0.32, rx: 26, ry: 10 },
  무광: { blur: 0, op: 0, rx: 0, ry: 0 },
};
export function glossSvg(level, base = '#a8784a') {
  const g = GLOSS_LOOK[level] || GLOSS_LOOK.무광;
  const id = 'gb' + Object.keys(GLOSS_LOOK).indexOf(level);
  const seams = [20, 40].map((y) => `<path d="M0 ${y} H120" stroke="${shade(base, 0.6)}" stroke-width="1"/>`).join('');
  const grain = [8, 15, 27, 34, 47, 53].map((y, i) => `<path d="M${i * 9} ${y} q30 ${i % 2 ? 1 : -1} 70 0" stroke="${shade(base, 0.8)}" stroke-width=".8" fill="none"/>`).join('');
  return `<svg class="gloss" viewBox="0 0 120 60" role="img" aria-label="${esc(level)} 바닥 반사 그림">
    <defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${g.blur}"/></filter></defs>
    <rect width="120" height="60" fill="${esc(base)}"/>${grain}${seams}
    ${g.op ? `<ellipse cx="60" cy="30" rx="${g.rx}" ry="${g.ry}" fill="#fff" opacity="${g.op}" filter="url(#${id})"/>` : ''}
  </svg>`;
}
