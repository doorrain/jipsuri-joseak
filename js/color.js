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
