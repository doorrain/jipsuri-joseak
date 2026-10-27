// 색 계산: 사진에서 색 뽑기, 기준 카드 보정, 색차(ΔE), 물감 섞임·토너 겹침 예상 색.
// 예상 색은 대략 계산(참고용)입니다. 정확한 값은 2단계 견본 촬영 후 바꿉니다.

export const hexToRgb = (h) => {
  const s = String(h || '#000').replace('#', '');
  const n = parseInt(s.length === 3 ? s.replace(/./g, (c) => c + c) : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const toLin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
export const lin = (rgb) => rgb.map(toLin);
export const unlin = (l) => l.map((v) => toSrgb(Math.max(0, Math.min(1, v))));

export function rgbToLab(rgb) {
  const [r, g, b] = lin(rgb);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

// CIEDE2000
export function deltaE(hexA, hexB) {
  const [L1, a1, b1] = rgbToLab(hexToRgb(hexA));
  const [L2, a2, b2] = rgbToLab(hexToRgb(hexB));
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0;
  else if (dhp > 180) dhp -= 360;
  else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const Sl = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2);
  const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
  const Rt = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export function deLabel(d) {
  if (d < 2) return '거의 같음';
  if (d < 4) return '가까움';
  if (d < 8) return '차이 보임';
  return '많이 다름';
}

// 시험칠(b)이 목표(a)에 비해 어떤지 → 고칠 방향
export function direction(targetHex, testHex) {
  const [L1, a1, b1] = rgbToLab(hexToRgb(targetHex));
  const [L2, a2, b2] = rgbToLab(hexToRgb(testHex));
  const out = [];
  const dL = L2 - L1, da = a2 - a1, db = b2 - b1;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  if (dL < -2) out.push('더 밝게');
  if (dL > 2) out.push('더 어둡게');
  if (da > 2.5) out.push('붉은 기 줄이기');
  if (da < -2.5) out.push('더 붉게');
  if (db > 3) out.push('노란 기 줄이기');
  if (db < -3) out.push('더 노랗게');
  if (C2 - C1 > 4) out.push('채도 낮추기');
  return out;
}

/* ---------- 사진에서 색 뽑기 ---------- */
// (x, y)는 0~1 비율. 반경 안의 픽셀 평균, 조명 반사(아주 밝은 픽셀)는 뺌
export function sampleAt(canvas, x, y, radiusFrac = 0.035) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  const r = Math.max(4, Math.round(Math.min(W, H) * radiusFrac));
  const cx = Math.round(x * W), cy = Math.round(y * H);
  const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
  const w = Math.min(W, cx + r) - x0, h = Math.min(H, cy + r) - y0;
  const d = ctx.getImageData(x0, y0, w, h).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    px.push([d[i], d[i + 1], d[i + 2], L]);
  }
  px.sort((a, b) => a[3] - b[3]);
  // 가장 밝은 15%(반사)와 가장 어두운 10%(긁힘·틈)는 빼고 평균
  const keep = px.slice(Math.floor(px.length * 0.1), Math.ceil(px.length * 0.85));
  const sum = [0, 0, 0];
  keep.forEach((p) => { sum[0] += toLin(p[0]); sum[1] += toLin(p[1]); sum[2] += toLin(p[2]); });
  const n = keep.length || 1;
  const glare = px.filter((p) => p[3] > 235).length / px.length;
  return { hex: rgbToHex(unlin(sum.map((v) => v / n))), glare };
}

/* ---------- 기준 카드 보정 ---------- */
// 흰색·회색 카드를 찍은 색으로 채널별 보정값을 구함 (회색은 R=G=B여야 함)
export function cardGain(cardHex) {
  const l = lin(hexToRgb(cardHex));
  const avg = (l[0] + l[1] + l[2]) / 3;
  return l.map((v) => (v > 0 ? avg / v : 1));
}
export function applyGain(hex, gain) {
  if (!gain) return hex;
  return rgbToHex(unlin(lin(hexToRgb(hex)).map((v, i) => v * gain[i])));
}

/* ---------- 예상 색 ---------- */
// 물감 섞임: 반사율의 가중 기하평균 (물감은 섞을수록 어두워지는 성질을 대략 흉내)
// 강한 색(프탈로·카본 등)은 한 방울의 힘이 훨씬 큼
export function mixPreview(parts) {
  const list = parts.filter((p) => p.drops > 0 && p.hex);
  if (!list.length) return null;
  const w = list.map((p) => p.drops * (p.strong ? 6 : 1));
  const tot = w.reduce((a, b) => a + b, 0);
  const acc = [0, 0, 0];
  list.forEach((p, i) => {
    lin(hexToRgb(p.hex)).forEach((v, c) => (acc[c] += (w[i] / tot) * Math.log(Math.max(v, 0.002))));
  });
  return rgbToHex(unlin(acc.map(Math.exp)));
}

// 바탕용: 타이탄버프를 약 20% 더 섞은 색
export function lighten20(parts, buffHex) {
  const tot = parts.reduce((a, p) => a + (p.drops || 0), 0);
  return mixPreview([...parts, { hex: buffHex, drops: tot * 0.2 }]);
}

// 토너 겹침: 반투명 필름 — 매번 토너 색 쪽으로 곱해짐 (밝아지지 않음)
export function tonerLayer(baseHex, tonerHex, passes = 1, strength = 0.42) {
  let l = lin(hexToRgb(baseHex));
  const t = lin(hexToRgb(tonerHex));
  for (let i = 0; i < passes; i++) l = l.map((v, c) => v * (1 - strength + strength * Math.min(1, t[c] / 0.75)));
  return rgbToHex(unlin(l));
}

// 투명 마감을 올리면 한 톤 진해짐
export const afterClear = (hex) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v) => v * 0.86)));

export const isDark = (hex) => rgbToLab(hexToRgb(hex))[0] < 55;

export function labToHex([L, a, b]) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const g = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = g(fx) * 0.95047, y = g(fy), z = g(fz) * 1.08883;
  const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
  const gg = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  const bb = 0.0557 * x - 0.204 * y + 1.057 * z;
  return rgbToHex(unlin([r, gg, bb]));
}

/* ---------- 광택 짐작 ---------- */
// 사진 속 조명 반사가 얼마나 또렷한지로 광택을 짐작 (참고용 — 각도·조명에 따라 틀릴 수 있음)
// cardPt: 기준 카드 위치(0~1) — 카드가 반사로 잡히지 않게 그 주변 비슷한 색은 뺌
// roi: 찍은 판들을 감싸는 범위 {x0,y0,x1,y1}(0~1) — 마루 밖 물건(가방·벽)을 빼려고. 없으면 가장자리 10%를 뺌
export function estimateGloss(canvas, cardPt, roi) {
  const W = 200, H = Math.max(1, Math.round((canvas.height / canvas.width) * W));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const N = W * H;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  // 볼 범위 밖은 뺌
  const r = roi || { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.9 };
  const mask = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (x < r.x0 * W || x > r.x1 * W || y < r.y0 * H || y > r.y1 * H) mask[y * W + x] = 1;
  // 카드 영역: 카드 점에서 비슷한 색으로 이어진 곳 + 테두리 2칸
  if (cardPt) {
    const sx = Math.min(W - 1, Math.round(cardPt.x * W)), sy = Math.min(H - 1, Math.round(cardPt.y * H));
    const s = (sy * W + sx) * 4, seed = [d[s], d[s + 1], d[s + 2]];
    const card = new Uint8Array(N);
    const q = [sy * W + sx];
    card[q[0]] = 1;
    while (q.length) {
      const p = q.pop(), x = p % W, y = (p / W) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        const n = ny * W + nx;
        if (card[n]) return;
        const k = n * 4;
        if (Math.abs(d[k] - seed[0]) + Math.abs(d[k + 1] - seed[1]) + Math.abs(d[k + 2] - seed[2]) < 70) { card[n] = 1; q.push(n); }
      });
    }
    for (let i = 0; i < N; i++) if (card[i]) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1;
      }
    }
  }
  // 결 무늬를 흐리게 (9칸 평균)
  const B = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || mask[yy * W + xx]) continue;
        sum += L[yy * W + xx]; n++;
      }
      B[y * W + x] = n ? sum / n : L[y * W + x];
    }
  // 사진 전체가 한쪽으로 밝아지는 것(노출 차이)은 반사가 아니므로 평면으로 맞춰 뺌: bg = a + b·x + c·y
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (let i = 0; i < N; i++) {
    if (mask[i]) continue;
    const x = (i % W) / W, y = ((i / W) | 0) / H, z = B[i];
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z;
  }
  if (n < N * 0.15) return null;
  // 3x3 정규방정식 (크라메르)
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], v = [sz, sxz, syz];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(A);
  const col = (k) => A.map((row, i) => row.map((x, j) => (j === k ? v[i] : x)));
  const [a, b, cc] = D ? [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D] : [sz / n, 0, 0];
  let faint = 0, glow = 0, hot = 0, edge = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      const bg = Math.max(20, a + (b * x) / W + (cc * y) / H);
      if (B[i] > Math.max(bg * 1.12, bg + 10)) faint++;
      if (B[i] > Math.max(bg * 1.35, bg + 25)) glow++;
      if (L[i] > Math.max(232, bg * 1.9)) {
        hot++;
        // 반사 가장자리가 또렷한지: 주변과 밝기 차이
        const g = Math.max(Math.abs(L[i] - L[i - 1]), Math.abs(L[i] - L[i + 1]), Math.abs(L[i] - L[i - W]), Math.abs(L[i] - L[i + W]));
        if (g > 40) edge++;
      }
    }
  const fFaint = faint / n, fGlow = glow / n, fHot = hot / n, sharp = hot ? edge / hot : 0;
  let level, why;
  if (fHot > 0.003 && (sharp > 0.12 || fHot > 0.02)) { level = '유광'; why = '조명 반사가 또렷하게 찍혔습니다'; }
  else if (fGlow > 0.04) { level = '반광'; why = '반사가 넓게 번져 보입니다'; }
  else if (fGlow > 0.012 || fFaint > 0.04) { level = '하광'; why = '반사가 희미하게만 보입니다'; }
  else { level = '무광'; why = '반사가 거의 없습니다'; }
  return { level, why, fFaint, fGlow, fHot, sharp };
}
