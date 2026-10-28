// 새 조색 화면 — 채팅처럼 쌓이는 한 화면
// 바탕색: 기준 사진 → 조색 제안(g) → 시험칠 사진 → 수정 제안(컵에 더 넣기) → … → 확정
// 토너: 1번 뿌린 사진 → 더 / 그만 → … → 완료
// 마감: 광택 고르기 → 저장 (다음 현장의 시작점이 됨)
import { store, save, remove, newId } from './store.js';
import { esc } from './util.js';
import { sampleAt, cardGain, applyGain, deltaE, estimateGloss } from './color.js';
import { uploadPhoto, deletePhotos, photoUrls, photoBase64 } from './photos.js';
import { askAI, aiReady } from './ai.js';
import { FEELINGS, GLOSS } from './seed.js';
import { glossSvg } from './visual.js';
import { ic } from './icons.js';
import { fmtG, cupTotal, cupHex, proposeCup, scaleCup, baseFix, tonerPlanFrom, tonerCheck, patchInTarget } from './mixcalc.js';

let H; // app.js 도구들
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const CUPS = [1, 3, 5, 7, 10, 15];
const STAGE_NAME = { base: '바탕색', toner: '토너', finish: '마감' };
const mixUI = { cupG: 5, feel: {}, working: '' };

const nowIso = () => new Date().toISOString();
const say = (o) => ({ id: newId('m'), who: 'app', at: nowIso(), ...o });
const me = (o) => ({ id: newId('m'), who: 'me', at: nowIso(), ...o });
const stagesOf = (j) => (H.isWood(j) ? ['base', 'toner', 'finish'] : ['base', 'finish']);
const lastOf = (log, f) => { for (let i = log.length - 1; i >= 0; i--) if (f(log[i])) return log[i]; return null; };
const photoOf = (j, pid) => (j.photos || []).find((p) => p.id === pid);

/* ---------- 지금 할 일 ---------- */
function need(j) {
  const m = j.mix || {};
  const log = m.log || [];
  if (m.stage === 'done') return 'done';
  const ref = log.find((e) => e.kind === 'ref');
  if (!ref) return 'ref_photo';
  if (!ref.target) return 'ref_tap';
  if (!m.cup) return 'propose';
  const lastPhoto = lastOf(log, (e) => e.who === 'me' && e.kind === 'test');
  if (lastPhoto && !lastPhoto.patch) return 'test_tap';
  if (lastPhoto && !lastPhoto.answered) return 'test_ask';
  if (m.stage === 'finish') return 'finish';
  return m.stage === 'toner' ? 'toner_next' : 'base_next';
}

export function renderMix(view, id, helpers) {
  H = helpers;
  const scroll = H.scrollNew;
  H.scrollNew = false;
  const j = H.findJob(id);
  if (!j) return (view.innerHTML = '<div class="empty">기록을 찾을 수 없습니다</div>');
  const m = j.mix || { stage: 'base', log: [] };
  const stages = stagesOf(j);
  const n = need(j);
  const si = m.stage === 'done' ? stages.length : stages.indexOf(m.stage);
  view.innerHTML = `
    <div class="hd sub"><button class="icon-btn" data-go="#jobs">${ic('back')}</button><h1 class="grow ell">${esc(H.jobTitle(j))}</h1>
      <button class="icon-btn" id="mx-more" aria-label="더보기">${ic('edit')}</button></div>
    <div class="mx-stages">${stages.map((s, i) => `<span class="${i < si ? 'done' : i === si ? 'now' : ''}">${i < si ? '✓ ' : `${i + 1} `}${STAGE_NAME[s]}</span>`).join('')}</div>
    <div class="mx-log">${(m.log || []).map((e) => bubble(j, e, n)).join('')}${mixUI.working ? `<div class="bb app"><span class="spin"></span>${esc(mixUI.working)}</div>` : ''}</div>
    <div class="mx-act">${mixUI.working ? '' : action(j, n) + ((m.log || []).length ? '<button class="undo" data-undo>↶ 이전으로 되돌리기</button>' : '')}</div>`;
  bind(view, j, n);
  // 사진 불러오기
  const paths = $$('img[data-path]', view).map((im) => im.dataset.path);
  if (paths.length) photoUrls(paths).then((u) => $$('img[data-path]', view).forEach((im) => (im.src = u[im.dataset.path] || ''))).catch(() => {});
  if (scroll) requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
}

/* ---------- 말풍선 ---------- */
const dot = (hex) => `<i class="dot" style="background:${esc(hex || '#ccc')}"></i>`;
function gList(items, mats, plus = false) {
  return `<ul class="glist">${items.map((p) => `<li>${dot(mats[p.id]?.hex)}<span class="grow">${esc(H.matName(mats[p.id]))}</span><b>${plus ? '+' : ''}${fmtG(p.g)}</b></li>`).join('')}</ul>`;
}
function mk(x, y, label, cls = '') {
  return `<span class="mk ${cls}" style="left:${x * 100}%;top:${y * 100}%;--c:#d9772b">${label}</span>`;
}
function bubble(j, e, n) {
  const mats = H.matMap();
  const m = j.mix;
  if (e.who === 'me' && (e.kind === 'ref' || e.kind === 'test')) {
    const ph = photoOf(j, e.photoId);
    const pending = e.kind === 'ref' ? n === 'ref_tap' && !e.target : n === 'test_tap' && !e.patch && e === lastOf(m.log, (x) => x.kind === 'test');
    const marks = e.kind === 'ref'
      ? `${e.card ? mk(e.card.x, e.card.y, '카드', 'card') : ''}${e.target ? mk(e.target.x, e.target.y, '목표') : ''}`
      : `${e.floor ? mk(e.floor.x, e.floor.y, '바닥', 'card') : ''}${e.patch ? mk(e.patch.x, e.patch.y, '시험칠') : ''}`;
    let hint = '';
    if (pending) {
      if (e.kind === 'ref') hint = !e.card && !e.cardSkip
        ? `<div class="tapq"><b>① 회색 카드 가운데</b>를 누르세요 <button class="chip sm" data-skipcard>카드 없음</button></div>`
        : `<div class="tapq"><b>② 보수할 곳과 같은 색</b>의 주변 판을 누르세요<small>결 무늬 말고 바탕색, 조명 반사는 피해서</small></div>`;
      else hint = !e.floor
        ? `<div class="tapq"><b>① 원래 바닥</b> (시험칠 바로 옆)을 누르세요</div>`
        : `<div class="tapq"><b>② 시험칠한 곳</b>을 누르세요</div>`;
    }
    const label = e.kind === 'ref' ? '기준 사진' : e.stage === 'toner' ? `토너 ${e.pass || ''}번 뿌린 뒤` : `시험칠 ${e.no || ''}`;
    const sw = e.kind === 'test' && e.patch ? `<div class="pair">${dot(e.floor.hex)}바닥 ${dot(e.patch.hex)}시험칠${e.feelings?.length ? ` · 눈: ${esc(e.feelings.join(', '))}` : ''}</div>` : '';
    return `<div class="bb me ${pending ? 'wide' : ''}">
      <div class="photo-tap ${pending ? 'live' : ''}" ${pending ? `data-tap="${e.id}"` : ''}><img data-path="${esc(ph?.path || '')}" alt="${label}" />${marks}</div>
      ${hint}<div class="cap">${label}</div>${sw}</div>`;
  }
  if (e.who === 'me') return `<div class="bb me txt">${esc(e.text)}</div>`;
  // 앱의 말
  const src = e.source === 'ai' ? '<span class="tag ai">AI</span>' : e.source === 'saved' ? '<span class="tag">내 레시피</span>' : e.source === 'calc' ? '<span class="tag">계산</span>' : '';
  let body = `<p>${esc(e.text)}</p>`;
  if (e.kind === 'propose') body += `${gList(e.cup, mats)}<div class="tot">컵 전체 ${fmtG(cupTotal(e.cup))}${e.tonerPlan ? ` · 토너 예정 ${esc(H.matName(mats[e.tonerPlan.id]))}` : ''}</div>`;
  if (e.kind === 'fix' && e.add?.length) body += gList(e.add, mats, true) + (e.applied ? '<div class="tot ok">✓ 넣었음</div>' : '');
  if (e.kind === 'toner' && e.tonerId) body += `<div class="tline">${dot(mats[e.tonerId]?.hex)}<b>${esc(H.matName(mats[e.tonerId]))}</b> ${esc(e.how || '')}</div>`;
  if (e.kind === 'summary') body = summary(j);
  if (e.tips?.length) body += `<ul class="bul small">${e.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const good = ['ok', 'stop'].includes(e.verdict);
  const bad = e.verdict === 'too_dark';
  return `<div class="bb app ${good ? 'good' : ''} ${bad ? 'bad' : ''}"><div class="who">${src}</div>${body}</div>`;
}

function summary(j) {
  const m = j.mix;
  const mats = H.matMap();
  const t = m.tonerPasses || [];
  const byT = {};
  t.forEach((p) => { byT[p.id] = (byT[p.id] || 0) + (p.how === '한 번 스치듯' ? 0.5 : 1); });
  return `<p><b>레시피 저장 완료</b> — 다음에 비슷한 색이면 여기서 시작합니다.</p>
    <div class="sub-h">① 바탕색 (컵 ${fmtG(cupTotal(m.cup))})</div>${gList(m.cup, mats)}
    ${Object.keys(byT).length ? `<div class="sub-h">② 토너</div><ul class="glist">${Object.entries(byT).map(([id, k]) => `<li>${dot(mats[id]?.hex)}<span class="grow">${esc(H.matName(mats[id]))}</span><b>${k}번</b></li>`).join('')}</ul>` : ''}
    ${m.finish ? `<div class="sub-h">③ 마감</div><ul class="glist"><li>${dot('#eee')}<span class="grow">${esc(H.matName(mats[m.finish.clearId]))}</span><b>${esc(m.finish.gloss)}</b></li></ul>` : ''}`;
}

/* ---------- 아래 버튼 ---------- */
const fileBtn = (label, cls = 'accent', id = 'mx-file') => `<label class="btn ${cls} grow">${ic('camera')}${label}<input type="file" accept="image/*" id="${id}" hidden /></label>`;
function action(j, n) {
  const m = j.mix;
  const log = m.log || [];
  const lastApp = lastOf(log, (e) => e.who === 'app');
  switch (n) {
    case 'ref_photo':
      return `<p class="ah">회색 카드를 판 옆에 놓고, 플래시 없이 보수할 곳과 주변 판이 보이게 찍으세요.</p><div class="btns">${fileBtn('기준 사진 찍기')}</div>`;
    case 'ref_tap':
    case 'test_tap':
      return `<p class="ah">위 사진에서 순서대로 눌러 주세요.</p><div class="btns"><button class="btn line grow" data-retake>${ic('camera')}사진 다시 찍기</button></div>`;
    case 'propose':
      return `<p class="ah">이번에 섞을 컵 양</p><div class="chips" data-cup>${CUPS.map((g) => `<button class="chip ${mixUI.cupG === g ? 'on' : ''}" data-v="${g}">${g}g</button>`).join('')}</div>
        <div class="btns" style="margin-top:10px"><button class="btn accent grow" data-propose>조색 제안 받기</button></div>`;
    case 'test_ask': {
      const e = lastOf(log, (x) => x.kind === 'test');
      const f = mixUI.feel[e.id] || [];
      return `<p class="ah">눈으로 보기에 시험칠이 어떤가요? (선택, 여러 개 가능)</p>
        <div class="chips" data-feel>${FEELINGS.filter((x) => x !== '맞음').map((x) => `<button class="chip ${f.includes(x) ? 'on' : ''}" data-v="${x}">${x === '더 밝게' ? '더 밝아야 함' : x === '더 어둡게' ? '더 어두워야 함' : x === '더 노랗게' ? '더 노래야 함' : x === '더 붉게' ? '더 붉어야 함' : x === '더 회색빛' ? '더 회색빛이어야 함' : x}</button>`).join('')}</div>
        <div class="btns" style="margin-top:10px"><button class="btn accent grow" data-ask>${m.stage === 'toner' ? '더 뿌릴지 판단 받기' : '수정 제안 받기'}</button></div>`;
    }
    case 'base_next': {
      const pend = lastApp?.kind === 'fix' && lastApp.add?.length && !lastApp.applied;
      if (pend) return `<div class="btns"><button class="btn accent grow" data-applied>넣었어요</button><button class="btn line" data-skipadd>안 넣을래요</button></div>`;
      const ok = lastApp?.verdict === 'ok';
      const tested = log.some((e) => e.kind === 'test' && e.stage === 'base');
      return `<p class="ah">${tested ? '잘 섞어 다시 칠하고, 완전히 마른 뒤 원래 바닥과 한 장에 찍으세요.' : '조금 칠해서 완전히 마른 뒤, 시험칠과 원래 바닥이 한 장에 나오게 찍으세요.'}</p>
        <div class="btns">${ok ? `<button class="btn accent grow" data-confirm>바탕색 확정</button>${fileBtn('다시 시험칠', 'line')}` : `${fileBtn('시험칠 사진 올리기')}${tested ? '<button class="btn line" data-confirm>이대로 확정</button>' : ''}`}</div>`;
    }
    case 'toner_next': {
      const stop = ['stop', 'too_dark'].includes(lastApp?.verdict);
      const passes = (m.tonerPasses || []).length;
      return `<p class="ah">${stop ? '토너를 멈추고 마감으로 넘어가세요.' : `30~40cm에서 얇게 ${passes ? '한 번 더' : '1번'} 뿌리고, 마른 뒤 원래 바닥과 한 장에 찍으세요.`}</p>
        <div class="btns">${stop ? `<button class="btn accent grow" data-tdone>토너 완료</button>${fileBtn('그래도 사진 올리기', 'line')}` : `${fileBtn(`${passes + 1}번째 뿌린 사진 올리기`)}${passes ? '<button class="btn line" data-tdone>토너 완료</button>' : ''}`}</div>`;
    }
    case 'finish': {
      const g = m.glossPick || m.glossGuess || '하광';
      const clear = H.CLEAR_BY_GLOSS[g];
      const have = H.owned(H.matMap()[clear]);
      return `<p class="ah">주변 광택을 고르세요${m.glossGuess ? ` (사진으로 보면 <b>${m.glossGuess}</b> 같습니다)` : ''}</p>
        <div class="ggrid">${GLOSS.map((x) => `<button class="gpick ${x === g ? 'on' : ''}" data-gloss="${x}">${glossSvg(x)}<b>${x}</b></button>`).join('')}</div>
        <p class="small ${have ? 'muted' : 'warn'}" style="margin:8px 0">${esc(H.matName(H.matMap()[clear]))}${have ? '' : ' — 없는 재료입니다. 하광으로 마감한 뒤 비교하세요.'}</p>
        <div class="btns"><button class="btn accent grow" data-finish>마감 완료, 레시피 저장</button></div>`;
    }
    case 'done':
      return `<label class="field"><span>이름 (다음에 찾기 쉽게)</span><input id="mx-title" value="${esc(j.title || '')}" placeholder="예: 래미안 거실 체리 원목마루" /></label>
        <div class="btns"><button class="btn grow" data-savetitle>이름 저장</button><button class="btn line grow" data-another>같은 사진으로 다른 판 조색</button></div>`;
  }
  return '';
}

/* ---------- 동작 ---------- */
const upd = async (j, f) => {
  const cur = H.findJob(j.id);
  const mix = structuredClone(cur.mix || { stage: 'base', log: [] });
  const extra = (await f(mix, cur)) || {};
  await save('jobs', { ...cur, ...extra, mix });
};
async function working(label, fn) {
  mixUI.working = label;
  H.rerender();
  try { await fn(); } catch (err) { alert(err.message || String(err)); }
  mixUI.working = '';
  H.rerender(true);
}

function bind(view, j, n) {
  $('#mx-more', view).onclick = () => moreSheet(j);
  const und = $('[data-undo]', view);
  if (und) und.onclick = () => undo(j);
  const file = $('#mx-file', view);
  if (file) file.onchange = (e) => e.target.files[0] && addPhoto(j, e.target.files[0]);
  const retake = $('[data-retake]', view);
  if (retake) retake.onclick = () => upd(j, (mx) => {
    const last = mx.log[mx.log.length - 1];
    if (last?.who === 'me' && ['ref', 'test'].includes(last.kind)) mx.log.pop();
  });
  $$('[data-tap]', view).forEach((box) => box.addEventListener('click', (ev) => tap(j, box, ev)));
  const skip = $('[data-skipcard]', view);
  if (skip) skip.onclick = (ev) => { ev.stopPropagation(); upd(j, (mx) => { mx.log.find((e) => e.kind === 'ref').cardSkip = true; }); };
  $$('[data-cup] .chip', view).forEach((b) => (b.onclick = () => { mixUI.cupG = +b.dataset.v; H.rerender(true); }));
  const prop = $('[data-propose]', view);
  if (prop) prop.onclick = () => propose(j);
  $$('[data-feel] .chip', view).forEach((b) => (b.onclick = () => {
    const e = lastOf(j.mix.log, (x) => x.kind === 'test');
    const f = new Set(mixUI.feel[e.id] || []);
    f.has(b.dataset.v) ? f.delete(b.dataset.v) : f.add(b.dataset.v);
    mixUI.feel[e.id] = [...f];
    b.classList.toggle('on');
  }));
  const ask = $('[data-ask]', view);
  if (ask) ask.onclick = () => (j.mix.stage === 'toner' ? askToner(j) : askBase(j));
  const applied = $('[data-applied]', view);
  if (applied) applied.onclick = () => upd(j, (mx) => {
    const fx = lastOf(mx.log, (e) => e.kind === 'fix');
    fx.applied = true;
    const cup = structuredClone(mx.cup);
    fx.add.forEach((a) => { const c = cup.find((p) => p.id === a.id); if (c) c.g = Math.round((c.g + a.g) * 1000) / 1000; else cup.push({ id: a.id, g: a.g }); });
    mx.cup = cup;
    mx.log.push(me({ text: `넣었어요 (컵 ${fmtG(cupTotal(cup))})` }));
  });
  const skipadd = $('[data-skipadd]', view);
  if (skipadd) skipadd.onclick = () => upd(j, (mx) => { lastOf(mx.log, (e) => e.kind === 'fix').applied = 'skip'; mx.log.push(me({ text: '안 넣고 그대로 갈게요' })); });
  const conf = $('[data-confirm]', view);
  if (conf) conf.onclick = () => confirmBase(j);
  const tdone = $('[data-tdone]', view);
  if (tdone) tdone.onclick = () => toFinish(j);
  $$('[data-gloss]', view).forEach((b) => (b.onclick = () => upd(j, (mx) => { mx.glossPick = b.dataset.gloss; })));
  const fin = $('[data-finish]', view);
  if (fin) fin.onclick = () => finish(j);
  const st = $('[data-savetitle]', view);
  if (st) st.onclick = async () => { await save('jobs', { ...H.findJob(j.id), title: $('#mx-title').value.trim() }); H.toast('저장했습니다'); };
  const an = $('[data-another]', view);
  if (an) an.onclick = () => another(j);
}

async function addPhoto(j, f) {
  await working('사진을 줄여서 저장하는 중…', async () => {
    const n = need(j);
    const ph = await uploadPhoto(j.id, f, n === 'ref_photo' ? '현장' : '시험칠');
    await upd(j, (mx, cur) => {
      if (n === 'ref_photo') mx.log.push(me({ kind: 'ref', photoId: ph.id }));
      else {
        const stage = mx.stage;
        const no = mx.log.filter((e) => e.kind === 'test' && e.stage === stage).length + 1;
        const e = me({ kind: 'test', photoId: ph.id, stage, no });
        if (stage === 'toner') {
          const lastT = lastOf(mx.log, (x) => x.kind === 'toner');
          mx.tonerPasses = [...(mx.tonerPasses || []), { id: lastT?.tonerId || mx.tonerPlan?.id, how: lastT?.how || '' }];
          e.pass = mx.tonerPasses.length;
        }
        mx.log.push(e);
      }
      return { photos: [...(cur.photos || []), ph], ...(n === 'ref_photo' ? { mainPhotoId: ph.id } : {}) };
    });
    H.scrollNew = true;
  });
}

async function tap(j, box, ev) {
  const img = $('img', box);
  const r = img.getBoundingClientRect();
  const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  const e = j.mix.log.find((z) => z.id === box.dataset.tap);
  const cv = await H.canvasFor(photoOf(j, e.photoId));
  if (e.kind === 'ref') {
    if (!e.card && !e.cardSkip) {
      const s = sampleAt(cv, x, y, 0.02);
      return upd(j, (mx, cur) => { mx.log.find((z) => z.id === e.id).card = { x, y, hex: s.hex }; return { cardHex: s.hex, cardGain: cardGain(s.hex) }; });
    }
    const s = sampleAt(cv, x, y, 0.035);
    if (s.glare > 0.15) H.toast('조명 반사가 많은 곳입니다. 옆을 다시 눌러 보세요');
    const gain = e.card ? cardGain(e.card.hex) : null;
    const hex = applyGain(s.hex, gain);
    // 광택 짐작 (참고)
    let guess = null;
    try { guess = estimateGloss(cv, e.card, { x0: Math.max(0, x - 0.25), y0: Math.max(0, y - 0.25), x1: Math.min(1, x + 0.25), y1: Math.min(1, y + 0.25) })?.level; } catch (_) {}
    return upd(j, (mx) => {
      mx.log.find((z) => z.id === e.id).target = { x, y, raw: s.hex, hex };
      mx.target = hex;
      if (guess) mx.glossGuess = guess;
      const past = nearestSaved(j, hex);
      mx.log.push(say({ text: `목표색을 찍었습니다.${past ? ` 전에 맞춘 "${H.jobTitle(past.j)}"와 비슷합니다 (색 차이 ${past.de.toFixed(1)}).` : ''} 섞을 컵 양을 고르고 조색 제안을 받으세요.`, swatch: hex }));
    });
  }
  const s = sampleAt(cv, x, y, 0.025);
  return upd(j, (mx) => {
    const z = mx.log.find((q) => q.id === e.id);
    if (!z.floor) z.floor = { x, y, hex: s.hex };
    else z.patch = { x, y, hex: s.hex };
  });
}

/* ---------- 내 레시피(확정한 것) 중 가장 비슷한 것 ---------- */
function nearestSaved(j, hex) {
  let best = null;
  store.state.jobs.forEach((o) => {
    if (o.id === j.id || o.mix?.stage !== 'done' || !o.mix.target || !o.mix.cup) return;
    if ((o.surface || '마루') !== (j.surface || '마루')) return;
    const de = deltaE(hex, o.mix.target);
    if (de < 6 && (!best || de < best.de)) best = { j: o, de };
  });
  return best;
}
const savedForAI = (hex) => store.state.jobs
  .filter((o) => o.mix?.stage === 'done' && o.mix.target && o.mix.cup)
  .map((o) => ({ de: deltaE(hex, o.mix.target), target: o.mix.target, cup: o.mix.cup, toner: o.mix.tonerPasses, title: H.jobTitle(o) }))
  .sort((a, b) => a.de - b.de).slice(0, 5);

/* ---------- AI 부르기 (안 되면 계산으로) ---------- */
const useAI = () => H.aiOn() && aiReady();
function aiMats() {
  return H.ownedList().filter((m) => ['paint', 'toner', 'clear'].includes(m.kind)).map((m) => ({ id: m.id, name: m.name, kind: m.kind, code: m.code, hex: m.hex, strong: !!m.strong }));
}
async function callAI(j, step, extra, photoIds) {
  const imgs = [];
  for (const pid of photoIds) { const ph = photoOf(j, pid); if (ph) imgs.push(await photoBase64(ph.path)); }
  const mx = j.mix;
  const res = await askAI({
    mode: 'mix', step, images: imgs, materials: aiMats(), surface: `${j.surface || '마루'} / ${j.sub || ''}`,
    target_hex: mx.target, cup_g: mixUI.cupG, cup: mx.cup || [], toner_plan: mx.tonerPlan || null, toner_passes: mx.tonerPasses || [],
    history: (mx.log || []).filter((e) => e.who === 'app' && e.text).slice(-6).map((e) => e.text), past: savedForAI(mx.target), ...extra,
  });
  return res.result;
}
// AI가 준 g 정리: 없는 재료 빼고, 0.01g 반올림
function cleanG(list, kinds = ['paint']) {
  const mats = H.matMap();
  return (list || []).filter((p) => mats[p.id] && kinds.includes(mats[p.id].kind) && H.owned(mats[p.id]) && p.g > 0)
    .map((p) => ({ id: p.id, g: p.g >= 0.0095 ? Math.round(p.g * 100) / 100 : 0.005 }));
}

async function propose(j) {
  await working(useAI() ? 'AI가 사진을 보고 조합을 짜는 중… (10~30초)' : '조합 계산 중…', async () => {
    const mx = j.mix;
    const ctx = H.solveCtx(j);
    const cupG = mixUI.cupG;
    const past = nearestSaved(j, mx.target);
    let msg;
    const calc = proposeCup(mx.target, ctx, cupG);
    if (useAI()) {
      try {
        const ref = mx.log.find((e) => e.kind === 'ref');
        const r = await callAI(j, 'propose', { calc_hint: calc, target_point: ref.target, card: !!ref.card }, [ref.photoId]);
        let cup = cleanG(r.cup);
        const t = cupTotal(cup);
        if (cup.length && t > 0) {
          cup = scaleCup(cup, cupG);
          const tp = H.matMap()[r.toner_id]?.kind === 'toner' ? { id: r.toner_id, passes: r.passes || 1 } : calc.tonerPlan;
          msg = say({ kind: 'propose', source: 'ai', text: r.say, cup, tonerPlan: H.isWood(j) ? tp : null, tips: r.tips });
        }
      } catch (err) { H.toast('AI 연결 안 됨 — 계산으로 제안합니다'); console.warn(err); }
    }
    if (!msg && past && past.de < 3) {
      msg = say({ kind: 'propose', source: 'saved', text: `전에 맞춘 "${H.jobTitle(past.j)}" 레시피를 이번 컵 양으로 바꿨습니다. 칠해 보고 마른 뒤 찍어 주세요.`, cup: scaleCup(past.j.mix.cup, cupG), tonerPlan: past.j.mix.tonerPlan || null });
    }
    if (!msg) msg = say({ kind: 'propose', source: 'calc', text: `가진 물감으로 계산한 첫 조합입니다${H.isWood(j) ? ' (버프 20% 포함, 토너·마감 전이라 목표보다 한 톤 밝음)' : ''}. 0.01g 저울로 달아 섞고, 조금 칠해서 마른 뒤 찍어 주세요.`, cup: calc.cup, tonerPlan: H.isWood(j) ? calc.tonerPlan : null });
    await upd(j, (m) => { m.cup = msg.cup; m.cupG = cupG; m.tonerPlan = msg.tonerPlan; m.log.push(msg); });
    H.scrollNew = true;
  });
}

async function askBase(j) {
  const e = lastOf(j.mix.log, (x) => x.kind === 'test');
  const feelings = mixUI.feel[e.id] || [];
  await working(useAI() ? 'AI가 시험칠과 바닥을 비교하는 중… (10~30초)' : '비교 계산 중…', async () => {
    const mx = j.mix;
    const ctx = H.solveCtx(j);
    const calc = baseFix({ cup: mx.cup, targetHex: mx.target, floorHex: e.floor.hex, patchHex: e.patch.hex, feelings, tonerPlan: mx.tonerPlan, ctx, matMap: H.matMap() });
    let msg;
    if (useAI()) {
      try {
        const ref = mx.log.find((x) => x.kind === 'ref');
        const r = await callAI(j, 'base_fix', { floor_hex: e.floor.hex, patch_hex: e.patch.hex, floor_point: e.floor, patch_point: e.patch, feelings: feelings.map((f) => `시험칠을 ${f} 해야 함`),calc_hint: { verdict: calc.verdict, add: calc.add, dirs: calc.dirs, de: +calc.deNow.toFixed(1) } }, [ref.photoId, e.photoId]);
        const tot = cupTotal(mx.cup);
        let add = cleanG(r.add);
        const sum = cupTotal(add);
        if (sum > tot * 0.4) add = add.map((p) => ({ id: p.id, g: Math.round(((p.g * tot * 0.4) / sum) * 100) / 100 }));
        const verdict = r.verdict === 'ok' ? 'ok' : add.length ? 'add' : 'stuck';
        msg = say({ kind: 'fix', source: 'ai', verdict, text: r.say, add: verdict === 'add' ? add : [], tips: r.tips });
      } catch (err) { H.toast('AI 연결 안 됨 — 계산으로 판단합니다'); console.warn(err); }
    }
    if (!msg) msg = say({ kind: 'fix', source: 'calc', verdict: calc.verdict, text: calc.say, add: calc.add });
    await upd(j, (m) => {
      const z = m.log.find((q) => q.id === e.id);
      z.answered = true;
      z.feelings = feelings;
      z.inTarget = patchInTarget(m.target, e.floor.hex, e.patch.hex, feelings);
      m.log.push(msg);
    });
    H.scrollNew = true;
  });
}

async function confirmBase(j) {
  await upd(j, (mx) => {
    mx.log.push(me({ text: '바탕색 확정' }));
    if (!H.isWood(j)) { mx.stage = 'finish'; mx.log.push(say({ text: '마지막으로 주변 광택을 골라 주세요.' })); return; }
    mx.stage = 'toner';
    // 실제 칠한 바탕(마지막 시험칠)에서 토너를 고름
    const t = lastOf(mx.log, (e) => e.kind === 'test' && e.stage === 'base' && e.inTarget);
    const toners = H.solveCtx(j).toners;
    const plan = t ? tonerPlanFrom(mx.target, t.inTarget, toners) : mx.tonerPlan;
    if (plan) mx.tonerPlan = { id: plan.id, passes: plan.passes };
    const tm = H.matMap()[mx.tonerPlan?.id];
    mx.log.push(say({ kind: 'toner', source: 'calc', tonerId: mx.tonerPlan?.id, how: '얇게 1번', text: `토너는 ${tm ? H.matName(tm) : '가진 것 중 가까운 색'}${mx.tonerPlan?.passes > 1 ? ` (예상 ${mx.tonerPlan.passes}번)` : ''}입니다. 바탕이 완전히 마른 뒤 얇게 1번 뿌리고, 마르면 찍어 주세요.`, tips: ['30~40cm 거리에서 미스트처럼 얇게', '판 이음새는 마스킹테이프로 가리기'] }));
  });
  H.scrollNew = true;
}

async function askToner(j) {
  const e = lastOf(j.mix.log, (x) => x.kind === 'test');
  const feelings = mixUI.feel[e.id] || [];
  await working(useAI() ? 'AI가 토너 상태를 보는 중… (10~30초)' : '비교 계산 중…', async () => {
    const mx = j.mix;
    const toners = H.solveCtx(j).toners;
    const curT = (mx.tonerPasses || []).slice(-1)[0]?.id || mx.tonerPlan?.id;
    const calc = tonerCheck({ targetHex: mx.target, floorHex: e.floor.hex, patchHex: e.patch.hex, feelings, tonerId: curT, toners });
    let msg;
    if (useAI()) {
      try {
        const ref = mx.log.find((x) => x.kind === 'ref');
        const r = await callAI(j, 'toner_check', { floor_hex: e.floor.hex, patch_hex: e.patch.hex, floor_point: e.floor, patch_point: e.patch, feelings: feelings.map((f) => `시험칠을 ${f} 해야 함`),current_toner: curT, calc_hint: { verdict: calc.verdict, toner: calc.tonerId, how: calc.how } }, [ref.photoId, e.photoId]);
        const ok = ['more', 'light', 'stop', 'too_dark'].includes(r.verdict);
        if (ok) {
          const tid = H.matMap()[r.toner_id]?.kind === 'toner' ? r.toner_id : curT;
          msg = say({ kind: 'toner', source: 'ai', verdict: r.verdict, text: r.say, tonerId: ['more', 'light'].includes(r.verdict) ? tid : null, how: r.verdict === 'light' ? '한 번 스치듯' : r.verdict === 'more' ? '1번 더 얇게' : '', tips: r.tips });
        }
      } catch (err) { H.toast('AI 연결 안 됨 — 계산으로 판단합니다'); console.warn(err); }
    }
    if (!msg) msg = say({ kind: 'toner', source: 'calc', verdict: calc.verdict, text: calc.say, tonerId: ['more', 'light'].includes(calc.verdict) ? calc.tonerId : null, how: calc.how || '' });
    await upd(j, (m) => { const z = m.log.find((q) => q.id === e.id); z.answered = true; z.feelings = feelings; m.log.push(msg); });
    H.scrollNew = true;
  });
}

async function toFinish(j) {
  await upd(j, (mx) => {
    mx.log.push(me({ text: `토너 완료 (${(mx.tonerPasses || []).length}번)` }));
    mx.stage = 'finish';
    mx.log.push(say({ text: `마지막으로 주변 광택을 골라 주세요.${mx.glossGuess ? ` 기준 사진으로 보면 ${mx.glossGuess} 같습니다.` : ''} 애매하면 한 단계 낮은 쪽부터 뿌리세요.` }));
  });
  H.scrollNew = true;
}

async function finish(j) {
  await upd(j, (mx) => {
    const g = mx.glossPick || mx.glossGuess || '하광';
    mx.finish = { gloss: g, clearId: H.CLEAR_BY_GLOSS[g] };
    mx.stage = 'done';
    mx.log.push(me({ text: `${g} 마감 완료` }));
    mx.log.push(say({ kind: 'summary' }));
    return { saved: true, status: '완료' };
  });
  H.scrollNew = true;
}

async function another(j) {
  const cur = H.findJob(j.id);
  const ref = cur.mix.log.find((e) => e.kind === 'ref');
  const ph = photoOf(cur, ref.photoId);
  const id = newId('j');
  const mix = { stage: 'base', log: [me({ kind: 'ref', photoId: ph.id, card: ref.card, cardSkip: ref.cardSkip })] };
  await save('jobs', { id, surface: cur.surface, sub: cur.sub, status: '진행', points: [], photos: [{ ...ph, shared: true }], fixes: [], tags: cur.tags || [], cardHex: cur.cardHex, cardGain: cur.cardGain, mainPhotoId: ph.id, mix });
  H.go('#mix/' + id);
}

function moreSheet(j) {
  const cur = H.findJob(j.id);
  const surf = H.SURFACES.find((s) => s.k === cur.surface) || H.SURFACES[0];
  H.openSheet(`${H.sheetHead('조색 기록')}
    <div class="sec-title" style="margin-top:0">소재</div>
    ${H.chipRow('surface', H.SURFACES.map((s) => s.k), cur.surface)}<div style="height:8px"></div>${H.chipRow('sub', surf.sub, cur.sub)}
    <label class="field" style="margin-top:12px"><span>이름</span><input id="ms-title" value="${esc(cur.title || '')}" /></label>
    <label class="field"><span>메모</span><textarea id="ms-note">${esc(cur.note || '')}</textarea></label>
    <div class="btns"><button class="btn grow" id="ms-save">저장</button></div>
    <hr class="sep" />
    <button class="btn danger block" id="ms-del">${ic('trash')}이 조색 기록 삭제</button>`, (sh) => {
    H.bindChips(sh, 'surface', async (v) => { const s = H.SURFACES.find((x) => x.k === v); await save('jobs', { ...H.findJob(j.id), surface: v, sub: s.sub[0] }); H.closeSheet(); });
    H.bindChips(sh, 'sub', (v) => save('jobs', { ...H.findJob(j.id), sub: v }));
    $('#ms-save', sh).onclick = async () => { await save('jobs', { ...H.findJob(j.id), title: $('#ms-title', sh).value.trim(), note: $('#ms-note', sh).value }); H.closeSheet(); H.toast('저장했습니다'); };
    $('#ms-del', sh).onclick = async () => {
      if (!confirm('이 조색 기록과 사진이 지워집니다. 삭제할까요?')) return;
      const c = H.findJob(j.id);
      // 다른 기록이 같이 쓰는 사진은 남김
      const usedElse = new Set(store.state.jobs.filter((o) => o.id !== j.id).flatMap((o) => (o.photos || []).map((p) => p.path)));
      try { await deletePhotos((c.photos || []).filter((p) => !usedElse.has(p.path))); } catch (_) {}
      await remove('jobs', j.id);
      H.closeSheet();
      H.go('#jobs');
    };
  });
}

// 마지막 말풍선(내 것 + 그에 대한 답)을 지움 — 잘못 누른 것 되돌리기
async function undo(j) {
  await upd(j, (mx) => {
    const log = mx.log;
    if (!log.length) return;
    const last = log[log.length - 1];
    if (last.kind === 'summary') { log.pop(); log.pop(); mx.stage = 'finish'; delete mx.finish; return; }
    if (last.who === 'app') {
      log.pop();
      if (last.swatch) { const r = log.find((e) => e.kind === 'ref'); if (r) delete r.target; return; }
      if (last.kind === 'propose') { delete mx.cup; return; }
      const t = lastOf(log, (e) => e.kind === 'test');
      if (t && t.answered) { delete t.answered; return; }
      if (last.kind === 'toner' && mx.stage === 'toner' && !log.some((e) => e.kind === 'test' && e.stage === 'toner')) { mx.stage = 'base'; if (log[log.length - 1]?.text === '바탕색 확정') log.pop(); }
      return;
    }
    if (last.kind === 'test' || last.kind === 'ref') {
      if (last.patch) { delete last.patch; return; }
      if (last.floor) { delete last.floor; return; }
      if (last.target) { delete last.target; return; }
      if (last.card) { delete last.card; return; }
      log.pop();
      if (last.stage === 'toner') mx.tonerPasses = (mx.tonerPasses || []).slice(0, -1);
      return;
    }
    if (last.text?.startsWith('넣었어요')) {
      log.pop();
      const fx = lastOf(log, (e) => e.kind === 'fix');
      if (fx) { fx.applied = false; const cup = mx.cup.map((p) => ({ ...p, g: Math.round((p.g - (fx.add.find((a) => a.id === p.id)?.g || 0)) * 100) / 100 })).filter((p) => p.g >= 0.01); mx.cup = cup; }
      return;
    }
    log.pop();
    if (mx.stage === 'finish' && last.text?.startsWith('토너 완료')) mx.stage = 'toner';
  });
}
