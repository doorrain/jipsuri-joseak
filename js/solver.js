// 계산 레시피·계산 보정 (AI 없이 휴대폰 안에서)
// 가진 물감·토너로 "토너·마감까지 올린 예상 색"이 목표에 가장 가까운 조합을 찾습니다.
// 예상 색은 물감 대략 색으로 계산한 것이라, 시험칠 한 번으로 차이를 재서 다시 계산합니다.
import { hexToRgb, rgbToHex, lin, unlin, rgbToLab, labToHex, deltaE, direction, mixPreview, lighten20, tonerLayer, afterClear } from './color.js';

// 같은 색이면 단순한 레시피를 고르도록 붙이는 벌점 (ΔE 단위)
const PEN = { noToner: 0.8, twoPass: 0.3, extraPaint: 0.5, strong: 0.3, white: 0.6, newToner: 0.6 };
const WHITE = 'g-tw';
const BUFF = 'g-tb';

const scaleHex = (hex, k) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v, c) => v * k[c])));
const ratio = (a, b) => { const A = lin(hexToRgb(a)), B = lin(hexToRgb(b)); return A.map((v, c) => Math.min(2, Math.max(0.5, (v + 0.002) / (B[c] + 0.002)))); };

// paints: [{id, hex, strong}], o: {toner, passes}, f: {buff, clear}
function makeModel(paints, buffHex, f) {
  const base = (d) => {
    const parts = paints.map((p, i) => ({ hex: p.hex, drops: d[i], strong: p.strong }));
    return f.buff ? lighten20(parts, buffHex) : mixPreview(parts);
  };
  const finish = (d, o) => {
    let c = base(d);
    if (!c) return null;
    if (o.toner) c = tonerLayer(c, o.toner.hex, o.passes);
    return f.clear ? afterClear(c) : c;
  };
  return { base, finish };
}

function makeCost(paints, M, target, f, prefer) {
  return (d, o) => {
    const fin = M.finish(d, o);
    if (!fin) return 1e9;
    let pen = 0, n = 0;
    d.forEach((v, i) => {
      if (v <= 0) return;
      n++;
      if (paints[i].strong) pen += PEN.strong;
      if (paints[i].id === WHITE) pen += PEN.white;
    });
    pen += Math.max(0, n - 3) * PEN.extraPaint;
    if (f.clear && !o.toner) pen += PEN.noToner;
    if (o.passes > 1) pen += PEN.twoPass;
    if (prefer && prefer.size && o.toner && !prefer.has(o.toner.id)) pen += PEN.newToner;
    return deltaE(target, fin) + pen;
  };
}

// 한 칸씩 늘리고 줄여 보며 나아지는 쪽으로 (addOnly: 이미 섞은 컵에 더 넣기만)
function refine(paints, cost, start, o, addOnly = false, maxAdd = Infinity) {
  let d = start.slice(), c = cost(d, o), added = 0;
  for (let it = 0; it < 80; it++) {
    let best = null;
    paints.forEach((p, i) => {
      const st = p.strong ? 0.1 : 0.5;
      (addOnly ? [st] : [st, -st]).forEach((s) => {
        const v = +(d[i] + s).toFixed(2);
        if (v < 0 || (p.strong && v > 1.5) || (addOnly && added + s > maxAdd)) return;
        const nd = d.slice();
        nd[i] = v;
        if (!nd.some((x) => x > 0)) return;
        const nc = cost(nd, o);
        if (nc < c - 1e-3 && (!best || nc < best.c)) best = { c: nc, d: nd, s };
      });
    });
    if (!best) break;
    d = best.d; c = best.c; added += best.s;
  }
  return { c, d, o };
}

// 판 하나 계산. ctx: {paints, toners, buffHex, plain, prefer, force}
// plain = 토너·마감 없는 소재(대리석·도장면 등), prefer = 이 현장에서 이미 쓰는 토너 (캔 수 줄이기)
// force = 토너를 이걸로 고정 ({toner, passes})
export function solveBoard(targetHex, ctx) {
  const { paints, toners, buffHex, plain } = ctx;
  const f = { buff: !plain, clear: !plain };
  const M = makeModel(paints, buffHex, f);
  const cost = makeCost(paints, M, targetHex, f, ctx.prefer);
  const opts = ctx.force ? [ctx.force] : [{ toner: null, passes: 0 }, ...(plain ? [] : toners.flatMap((t) => [{ toner: t, passes: 1 }, { toner: t, passes: 2 }]))];
  const normal = paints.map((p, i) => [p, i]).filter(([p]) => !p.strong);
  const seeds = opts.map((o) => {
    let best = null;
    const tryD = (d) => { const c = cost(d, o); if (!best || c < best.c) best = { c, d, o }; };
    const zero = () => new Array(paints.length).fill(0);
    for (let a = 0; a < normal.length; a++) {
      const one = zero();
      one[normal[a][1]] = 10;
      tryD(one);
      for (let b = a + 1; b < normal.length; b++)
        for (let k = 1; k <= 9; k++) {
          const d = zero();
          d[normal[a][1]] = k;
          d[normal[b][1]] = 10 - k;
          tryD(d);
        }
    }
    return best;
  }).sort((x, y) => x.c - y.c);
  let best = null;
  for (const s of seeds.slice(0, 5)) {
    const r = refine(paints, cost, s.d, s.o);
    if (!best || r.c < best.c) best = r;
  }
  const fin = M.finish(best.d, best.o);
  // 보정 토너: 한 번 스치듯(절반 세기) 뿌려서 더 가까워지면 추가
  let adjust = null;
  if (!plain) {
    const pre = best.o.toner ? tonerLayer(M.base(best.d), best.o.toner.hex, best.o.passes) : M.base(best.d);
    const de0 = deltaE(targetHex, fin);
    toners.forEach((t) => {
      const de = deltaE(targetHex, afterClear(tonerLayer(pre, t.hex, 1, 0.21)));
      if (de < de0 - 0.8 && (!adjust || de < adjust.de)) adjust = { t, de };
    });
  }
  return {
    paints: paints.map((p, i) => ({ id: p.id, drops: best.d[i] })).filter((p) => p.drops > 0),
    toner: best.o.toner ? { id: best.o.toner.id, passes: best.o.passes } : null,
    adjust: adjust ? { id: adjust.t.id, how: '한 번 스치듯' } : null,
    finished: adjust ? afterClear(tonerLayer(best.o.toner ? tonerLayer(M.base(best.d), best.o.toner.hex, best.o.passes) : M.base(best.d), adjust.t.hex, 1, 0.21)) : fin,
    de: adjust ? adjust.de : deltaE(targetHex, fin),
  };
}

// 목표 색을 차이 비율 k로 옮긴 값 (실제 = 계산 × k 이므로, 계산 목표 = 목표 ÷ k)
// 화면이 멈추지 않게 잠깐 양보 (setTimeout은 백그라운드에서 1초씩 늦어져서 MessageChannel 사용)
export const yieldUI = () => new Promise((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => ok(); c.port2.postMessage(0); });

// 여러 판: 같은 토너를 되도록 다시 쓰게 차례로 계산
export async function solveJob(targets, ctx, onStep) {
  const prefer = new Set();
  const out = [];
  for (let i = 0; i < targets.length; i++) {
    const r = solveBoard(targets[i], { ...ctx, prefer });
    if (r.toner) prefer.add(r.toner.id);
    out.push(r);
    onStep && onStep(i + 1, targets.length);
    await yieldUI();
  }
  return out;
}

export const correctTarget = (targetHex, k) => (k ? scaleHex(targetHex, k.map((v) => 1 / v)) : targetHex);

/* ---------- 계산 보정 ---------- */
// 시험칠 색 → 이대로 끝냈을 때(토너·마감 후) 예상 색
export function finalFromTest(testHex, stage, pred) {
  const sp = stage === '토너' ? pred.toned : stage === '마감' ? pred.finished : pred.base;
  if (!sp || !pred.finished) return testHex;
  return scaleHex(pred.finished, ratio(testHex, sp));
}
// 눈으로 본 느낌 → 시험칠이 목표에 비해 어떤지 (Lab에서 반대로 밀기)
const FEEL = {
  '더 밝게': { dir: '더 밝게', f: (l) => [l[0] - 4, l[1], l[2]] },
  '더 어둡게': { dir: '더 어둡게', f: (l) => [l[0] + 4, l[1], l[2]] },
  '더 노랗게': { dir: '더 노랗게', f: (l) => [l[0], l[1], l[2] - 5] },
  '더 붉게': { dir: '더 붉게', f: (l) => [l[0], l[1] - 4, l[2]] },
  '더 회색빛': { dir: '채도 낮추기', f: (l) => [l[0], l[1] * 1.2, l[2] * 1.2] },
  '너무 쨍함': { dir: '채도 낮추기', f: (l) => [l[0], l[1] * 1.2, l[2] * 1.2] },
};

const OPP = { '더 밝게': '더 어둡게', '더 어둡게': '더 밝게', '더 노랗게': '노란 기 줄이기', '더 붉게': '붉은 기 줄이기' };

// 시험칠(사진·느낌)로 차이 비율 k와 고칠 방법을 계산
// in: {target, testHex, feelings, stage, board, pred:{base,toned,finished}, ctx, matMap}
export function solveFix({ target, testHex, feelings = [], stage, board, pred, ctx, matMap }) {
  // 1) 차이 비율 k: 사진이 있으면 그 단계 예상 색과 비교
  const stagePred = stage === '토너' ? pred.toned : stage === '마감' ? pred.finished : pred.base;
  let k = testHex && stagePred ? ratio(testHex, stagePred) : [1, 1, 1];
  // 바탕은 일부러 한 톤 밝으므로, 끝냈을 때 예상 색으로 방향을 봄
  const photoDir = testHex ? direction(target, finalFromTest(testHex, stage, pred)) : [];
  // 눈으로 본 느낌은 사진이 말하지 않은 것만 더함 (눈이 우선)
  const extra = feelings.filter((x) => FEEL[x] && !photoDir.includes(FEEL[x].dir));
  if (extra.length) {
    const lab = extra.reduce((l, x) => FEEL[x].f(l), rgbToLab(hexToRgb(target)));
    k = k.map((v, c) => v * ratio(labToHex(lab), target)[c]);
  }
  const eye = extra.map((x) => FEEL[x].dir);
  const dirs = [...new Set([...photoDir.filter((d) => !eye.some((e) => OPP[e] === d)), ...eye])];
  const nowFinal = scaleHex(pred.finished || target, k); // 이대로 끝냈을 때 예상
  const deNow = deltaE(target, nowFinal);
  const tips = [];
  const res = { source: 'calc', k, recovery: false, actions: [], new_paints: [], toner_main: [], tips };
  if (!dirs.length && deNow < 2) {
    res.diagnosis = '계산상 거의 맞습니다. 그대로 다음 단계로 가세요.';
    return res;
  }
  const head = `목표와 차이: ${dirs.join(', ') || '조금'} (이대로 끝내면 ΔE ${deNow.toFixed(1)})`;
  const toner = board.toner?.main?.[0] ? { toner: matMap[board.toner.main[0].id], passes: board.toner.main[0].passes || 1 } : { toner: null, passes: 0 };

  if (stage === '토너' || stage === '마감') {
    const L = (h) => rgbToLab(hexToRgb(h))[0];
    if (L(nowFinal) < L(target) - 2) {
      res.recovery = true;
      res.diagnosis = `${head}. 토너가 진해졌습니다 — 밝은 토너로 덮어도 밝아지지 않으니 걷어내고 바탕부터 다시 합니다.`;
      const re = solveBoard(correctTarget(target, k), ctx);
      res.new_paints = re.paints;
      res.toner_main = re.toner ? [re.toner] : [];
      res.toner_clear = !re.toner;
      tips.push('다시 할 바탕은 이번 차이를 반영해 새로 계산했습니다 (레시피에 반영 누르기).');
      return res;
    }
    // 밝은 쪽 → 토너 한 번 더 (가장 가까워지는 것)
    const cur = stage === '마감' ? nowFinal : scaleHex(pred.toned || target, k);
    let best = null;
    ctx.toners.forEach((t) => [[0.42, '1회 더 얇게'], [0.21, '한 번 스치듯']].forEach(([s, how]) => {
      const de = deltaE(target, afterClear(tonerLayer(cur, t.hex, 1, s)));
      if (!best || de < best.de) best = { t, how, de };
    }));
    if (best && best.de < deNow - 0.5) {
      res.diagnosis = `${head}. 토너를 조금 더 올리면 가까워집니다.`;
      res.actions.push({ text: `${best.t.code} ${best.t.name} ${best.how} → 예상 ΔE ${best.de.toFixed(1)}`, paint_id: null, drops: 0 });
      if (stage === '마감') tips.push('마감 위에 토너를 올린 뒤 마감을 한 번 더 뿌립니다.');
    } else {
      res.diagnosis = `${head}. 가진 토너로는 더 가까워지지 않습니다. 결이나 광택 차이인지 눈으로 확인해 보세요.`;
    }
    return res;
  }

  // 바탕·결 단계: 이미 섞은 컵에 더 넣기 (버프 20%까지 들어간 컵)
  const { paints, buffHex, plain } = ctx;
  const old = board.base?.paints || [];
  const cup = paints.map((p) => old.find((x) => x.id === p.id)?.drops || 0);
  const oldTot = cup.reduce((a, b) => a + b, 0);
  const bi = paints.findIndex((p) => p.id === BUFF);
  if (!plain && bi >= 0) cup[bi] += oldTot * 0.2;
  const f = { buff: false, clear: !plain };
  const M = makeModel(paints, buffHex, f);
  const goal = correctTarget(target, k);
  const cost = makeCost(paints, M, goal, f);
  const r = oldTot ? refine(paints, cost, cup, toner, true, Math.max(2, oldTot * 0.6)) : null;
  const adds = r ? paints.map((p, i) => ({ id: p.id, drops: +(r.d[i] - cup[i]).toFixed(2) })).filter((x) => x.drops > 0) : [];
  const deAdd = r ? deltaE(goal, M.finish(r.d, toner)) : 99;
  if (adds.length && deAdd < 4) {
    res.diagnosis = `${head}. 지금 섞은 컵에 아래만 더 넣으세요.`;
    adds.forEach((a) => res.actions.push({ paint_id: a.id, drops: a.drops, text: `${matMap[a.id]?.name || a.id} ${a.drops < 0.5 ? '이쑤시개 끝' : `+${a.drops}방울`}` }));
    res.actions.push({ text: `잘 섞고 다시 시험칠 → 예상 ΔE ${deAdd.toFixed(1)}`, paint_id: null, drops: 0 });
    tips.push('더 넣은 컵을 잘 섞어 쓰고, 마른 뒤 다시 찍어 비교하세요.');
    res.new_paints = paints.map((p) => ({ id: p.id, drops: +((old.find((x) => x.id === p.id)?.drops || 0) + (adds.find((x) => x.id === p.id)?.drops || 0)).toFixed(2) })).filter((x) => x.drops > 0);
  } else {
    const re = solveBoard(goal, { ...ctx, force: toner });
    res.diagnosis = `${head}. 더 넣어서는 맞추기 어렵습니다 — 새로 섞는 게 낫습니다.`;
    res.new_paints = re.paints;
    res.actions.push({ text: `새 비율로 다시 섞기 (레시피에 반영 누르기) → 예상 ΔE ${re.de.toFixed(1)}`, paint_id: null, drops: 0 });
  }
  return res;
}
