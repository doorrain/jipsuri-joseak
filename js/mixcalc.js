// 새 조색 과정의 계산 (g 단위, 0.01g)
// 시험칠은 원래 바닥과 한 사진에서 비교합니다: 두 곳의 비율만 쓰므로 조명 차이가 상쇄됩니다.
// 수정은 언제나 "지금 컵에 더 넣기"만 — 처음부터 다시 섞으라고 하지 않습니다.
import { hexToRgb, rgbToHex, lin, unlin, rgbToLab, labToHex, deltaE, direction, mixPreview, tonerLayer, afterClear } from './color.js';
import { solveBoard } from './solver.js';

const BUFF = 'g-tb';
const r2 = (g) => Math.round(g * 100) / 100;
const scale = (hex, k) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v, c) => v * k[c])));
const ratio = (a, b) => { const A = lin(hexToRgb(a)), B = lin(hexToRgb(b)); return A.map((v, c) => Math.min(2.5, Math.max(0.4, (v + 0.002) / (B[c] + 0.002)))); };
const Lof = (hex) => rgbToLab(hexToRgb(hex))[0];
export const fmtG = (g) => `${(+g).toFixed(2)}g`;
export const cupTotal = (cup) => (cup || []).reduce((a, p) => a + (p.g || 0), 0);

// 컵의 색 (g을 무게로 섞음)
export function cupHex(cup, paints) {
  const by = Object.fromEntries(paints.map((p) => [p.id, p]));
  return mixPreview((cup || []).filter((p) => by[p.id]).map((p) => ({ hex: by[p.id].hex, drops: p.g, strong: by[p.id].strong })));
}
// 바탕 → 토너·마감까지 올렸을 때 (채널별 곱)
function finishMult(hex, plan, plain, matMap) {
  if (plain) return [1, 1, 1];
  let c = hex;
  if (plan?.id && matMap[plan.id]) c = tonerLayer(c, matMap[plan.id].hex, plan.passes || 1);
  return ratio(afterClear(c), hex);
}

// 눈으로 본 느낌 → 시험칠을 그쪽으로 읽음 (눈이 사진보다 우선)
const FEEL = {
  '더 밝게': (l) => [l[0] - 4, l[1], l[2]],
  '더 어둡게': (l) => [l[0] + 4, l[1], l[2]],
  '더 노랗게': (l) => [l[0], l[1], l[2] - 5],
  '더 붉게': (l) => [l[0], l[1] - 4, l[2]],
  '더 회색빛': (l) => [l[0], l[1] * 1.2, l[2] * 1.2],
  '너무 쨍함': (l) => [l[0], l[1] * 1.2, l[2] * 1.2],
};
// 시험칠을 목표색 기준으로 옮김: 목표 × (시험칠 ÷ 바로 옆 바닥)
export function patchInTarget(targetHex, floorHex, patchHex, feelings = []) {
  let p = scale(targetHex, ratio(patchHex, floorHex));
  const f = feelings.filter((x) => FEEL[x]);
  if (f.length) p = labToHex(f.reduce((l, x) => FEEL[x](l), rgbToLab(hexToRgb(p))));
  return p;
}

/* ---------- ① 첫 조합 ---------- */
// 계산: 가진 물감으로 토너·마감 후 색이 목표에 가장 가까운 조합 → 컵 무게로 나눔 (마루는 버프 20% 더)
export function proposeCup(targetHex, ctx, cupG) {
  const r = solveBoard(targetHex, ctx);
  const parts = r.paints.map((p) => ({ id: p.id, w: p.drops }));
  const tot = parts.reduce((a, p) => a + p.w, 0);
  if (!ctx.plain) {
    const b = parts.find((p) => p.id === BUFF);
    if (b) b.w += tot * 0.2; else parts.push({ id: BUFF, w: tot * 0.2 });
  }
  const sum = parts.reduce((a, p) => a + p.w, 0);
  const cup = parts.map((p) => ({ id: p.id, g: r2((cupG * p.w) / sum) })).filter((p) => p.g >= 0.01);
  return { cup, tonerPlan: r.toner, de: r.de };
}
// 저장해 둔 레시피를 이번 컵 무게로
export const scaleCup = (cup, cupG) => {
  const t = cupTotal(cup) || 1;
  return cup.map((p) => ({ id: p.id, g: r2((p.g * cupG) / t) })).filter((p) => p.g >= 0.01);
};

/* ---------- ② 바탕 시험칠 → 컵에 더 넣기 ---------- */
// in: {cup, targetHex, floorHex, patchHex, feelings, tonerPlan, ctx, matMap}
export function baseFix({ cup, targetHex, floorHex, patchHex, feelings, tonerPlan, ctx, matMap }) {
  const { paints, plain } = ctx;
  const P = patchInTarget(targetHex, floorHex, patchHex, feelings);
  const pred = cupHex(cup, paints);
  const m = finishMult(P, tonerPlan, plain, matMap);
  const finalNow = scale(P, m);
  const deNow = deltaE(targetHex, finalNow);
  const dirs = direction(targetHex, finalNow);
  const out = { source: 'calc', deNow, dirs, finalNow, add: [] };
  if (deNow < 2.2 && !feelings.some((f) => FEEL[f])) {
    out.verdict = 'ok';
    out.say = plain ? '거의 맞습니다. 이대로 확정하세요.' : '거의 맞습니다. 토너·마감까지 하면 목표에 가깝게 됩니다. 바탕을 확정하세요.';
    return out;
  }
  // 실제 = 계산 × k  →  계산 목표 = (목표 ÷ 마감 효과) ÷ k
  const k = ratio(P, pred);
  const goal = scale(targetHex, m.map((v, c) => 1 / (v * k[c])));
  const tot = cupTotal(cup);
  const ids = paints.map((p) => p.id);
  const g0 = ids.map((id) => cup.find((p) => p.id === id)?.g || 0);
  const cost = (g) => {
    const h = mixPreview(paints.map((p, i) => ({ hex: p.hex, drops: g[i], strong: p.strong })));
    let pen = 0;
    g.forEach((v, i) => { if (v > g0[i] + 1e-9) pen += g0[i] ? 0.15 : paints[i].strong ? 1.2 : paints[i].id === 'g-tw' ? 1.0 : 0.5; });
    return deltaE(goal, h) + pen;
  };
  let g = g0.slice(), c = cost(g), added = 0;
  const maxAdd = tot * 0.4;
  for (let it = 0; it < 120; it++) {
    let best = null;
    paints.forEach((p, i) => {
      const st = tot * (p.strong ? 0.003 : 0.02);
      if (added + st > maxAdd) return;
      const ng = g.slice();
      ng[i] += st;
      const nc = cost(ng);
      if (nc < c - 0.02 && (!best || nc < best.c)) best = { c: nc, g: ng, st };
    });
    if (!best) break;
    g = best.g; c = best.c; added += best.st;
  }
  out.add = paints.map((p, i) => ({ id: p.id, g: r2(g[i] - g0[i]) })).filter((x) => x.g >= 0.01);
  const after = mixPreview(paints.map((p, i) => ({ hex: p.hex, drops: g[i], strong: p.strong })));
  out.deAfter = after ? deltaE(goal, after) : deNow;
  const head = dirs.length ? `토너·마감까지 하면 목표와 비교해 ${dirs.join(', ')} 해야 합니다.` : '조금 차이가 있습니다.';
  if (out.add.length && out.deAfter < deNow - 0.5) {
    out.verdict = 'add';
    out.say = `${head} 지금 컵에 아래만 더 넣고 잘 섞어 다시 칠해 보세요.`;
  } else {
    out.verdict = 'stuck';
    out.add = [];
    out.say = `${head} 가진 물감을 더 넣어서는 계산상 가까워지지 않습니다. 눈으로 본 느낌을 골라 다시 판단을 받거나, 이 정도면 확정하세요.`;
  }
  return out;
}

/* ---------- ③ 토너 ---------- */
// 확정한 바탕(시험칠)에서 가장 가까워지는 토너와 예상 횟수
export function tonerPlanFrom(targetHex, baseInTarget, toners) {
  let best = null;
  toners.forEach((t) => [1, 2, 3].forEach((n) => {
    const de = deltaE(targetHex, afterClear(tonerLayer(baseInTarget, t.hex, n))) + (n - 1) * 0.3;
    if (!best || de < best.de) best = { id: t.id, passes: n, de };
  }));
  return best;
}
// 한 번 뿌린 뒤 사진: 더 / 그만 / 너무 진함
export function tonerCheck({ targetHex, floorHex, patchHex, feelings, tonerId, toners }) {
  const P = patchInTarget(targetHex, floorHex, patchHex, feelings);
  const finalNow = afterClear(P);
  const deNow = deltaE(targetHex, finalNow);
  const out = { source: 'calc', deNow, finalNow, tonerId };
  if (Lof(finalNow) < Lof(targetHex) - 2.5) {
    out.verdict = 'too_dark';
    out.say = '목표보다 진해졌습니다. 더 뿌리지 마세요. 조금 진한 정도면 그대로 마감하고, 많이 진하면 그 부분 토너를 걷어내고 다시 뿌립니다.';
    return out;
  }
  if (deNow < 2.5) {
    out.verdict = 'stop';
    out.say = '여기서 멈추세요. 마감을 올리면 한 톤 진해지면서 맞춰집니다.';
    return out;
  }
  let best = null;
  toners.forEach((t) => [[0.42, '1번 더 얇게'], [0.21, '한 번 스치듯']].forEach(([s, how]) => {
    const de = deltaE(targetHex, afterClear(tonerLayer(P, t.hex, 1, s))) + (t.id === tonerId ? 0 : 0.8);
    if (!best || de < best.de) best = { t, how, de, light: s < 0.3 };
  }));
  if (best && best.de < deNow - 0.4) {
    out.verdict = best.light ? 'light' : 'more';
    out.tonerId = best.t.id;
    out.how = best.how;
    out.say = `아직 목표보다 ${direction(targetHex, finalNow).join(', ') || '조금 다릅니다'}. ${best.t.id === tonerId ? '같은 토너로' : `토너를 ${best.t.code} ${best.t.name}(으)로 바꿔`} ${best.how} 뿌리고, 마른 뒤 다시 찍어 주세요.`;
  } else {
    out.verdict = 'stop';
    out.say = '더 뿌려도 가까워지지 않습니다. 여기서 멈추고 마감으로 넘어가세요. 결이나 광택 차이인지 눈으로 확인해 보세요.';
  }
  return out;
}
