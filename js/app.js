import { store, subscribe, initStore, login, logout, save, remove, saveSettings, restoreAll, newId } from './store.js';
import { esc, today, md, matches, download } from './util.js';
import { CATALOG, KIND_LABEL, SURFACES, GLOSS, FEELINGS, STAGES, GRAIN, GRAIN_TIPS, TONER_TIPS, GLOSS_TIPS, RECOVERY } from './seed.js';
import { sampleAt, cardGain, applyGain, deltaE, deLabel, direction, mixPreview, lighten20, tonerLayer, afterClear, hexToRgb, rgbToHex, lin, unlin, rgbToLab, estimateGloss } from './color.js';
import { solveJob, solveBoard, solveFix, correctTarget, yieldUI, finalFromTest } from './solver.js';
import { swatch, swatchFlow, drops, fmtDrops, tonerSteps, layerDiagram, grainSvg, glossSvg, markers } from './visual.js';
import { uploadPhoto, deletePhotos, photoUrls, photoBase64, photoCanvas, usedBytes } from './photos.js';
import { askAI, aiReady } from './ai.js';
import { ic } from './icons.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const view = $('#view');
const ui = { q: '', tapMode: 'board', table: false, guideBase: '#c8894e' };

/* ================= 공통 도구 ================= */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2400);
}
function openSheet(html, onMount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-bg"><div class="sheet"><div class="grab"></div>${html}</div></div>`;
  const bg = root.firstElementChild;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  $$('[data-close]', bg).forEach((b) => (b.onclick = closeSheet));
  onMount && onMount(bg.firstElementChild);
  return bg.firstElementChild;
}
const closeSheet = () => ($('#sheet-root').innerHTML = '');
const sheetHead = (title) => `<div class="sh"><h2>${title}</h2><button class="icon-btn" data-close>${ic('x')}</button></div>`;
const chipRow = (name, opts, val, multi = false) =>
  `<div class="chips" data-chips="${name}" ${multi ? 'data-multi' : ''}>${opts
    .map((o) => `<button type="button" class="chip ${(multi ? (val || []).includes(o) : o === val) ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`)
    .join('')}</div>`;
function bindChips(root, name, onChange) {
  const box = $(`[data-chips="${name}"]`, root);
  if (!box) return;
  const multi = box.hasAttribute('data-multi');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    if (multi) b.classList.toggle('on');
    else {
      $$('button', box).forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    }
    onChange && onChange(multi ? $$('.on', box).map((x) => x.dataset.v) : b.dataset.v);
  });
}
const busy = (btn, on, label) => {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spin"></span>${label || '처리 중…'}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.label || btn.innerHTML;
    btn.disabled = false;
  }
};

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

/* ================= 재료 ================= */
const S = () => store.state.settings;
function allMaterials() {
  const pens = (S().pens || []).map((p) => ({ ...p, kind: 'pen', brand: '결펜' }));
  return [...CATALOG, ...pens, ...(S().custom || [])];
}
const matMap = () => Object.fromEntries(allMaterials().map((m) => [m.id, m]));
const owned = (m) => (m.kind === 'pen' ? true : !(S().missing || []).includes(m.id));
const ownedList = () => allMaterials().filter(owned);
const matName = (m) => (m ? `${m.code && m.kind !== 'paint' ? m.code + ' ' : ''}${m.name}` : '?');
const BUFF = () => CATALOG.find((m) => m.id === 'g-tb').hex;
// AI는 선택: 설정에서 켜고(설치안내 4단계를 한 뒤) 클라우드로 로그인했을 때만 버튼이 보임
const aiOn = () => !!S().aiEnabled;
// 토너·결을 쓰는 소재 (나머지는 바탕색 그대로 맞춤)
const isWood = (j) => ['마루', '목재·몰딩·문'].includes(j.surface || '마루');
function solveCtx(j, allToners = false) {
  const list = allToners ? allMaterials().filter((m) => m.kind !== 'toner' ? owned(m) : true) : ownedList();
  return { paints: list.filter((m) => m.kind === 'paint'), toners: list.filter((m) => m.kind === 'toner'), buffHex: BUFF(), plain: !isWood(j) };
}

/* ================= 렌더링 ================= */
let renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    doRender();
  });
}
function route() {
  const [r, a, b] = (location.hash.slice(1) || 'jobs').split('/');
  return { r, a: a ? decodeURIComponent(a) : '', b: b ? decodeURIComponent(b) : '' };
}
// 입력 중이던 화면을 다시 그려서 흐트러지지 않게: 작업 화면은 데이터가 바뀌어도 사용자가 누른 것만 다시 그림
let lastKey = '';
function doRender(force) {
  const { r, a, b } = route();
  const tab = { jobs: 'jobs', job: 'jobs', fix: 'jobs', print: 'jobs', materials: 'materials', grain: 'grain', settings: 'settings' }[r] || 'jobs';
  $$('#tabbar button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
  document.body.classList.toggle('printing', r === 'print');
  if (!store.ready) {
    view.innerHTML = '<div class="empty" style="padding-top:40vh">불러오는 중…</div>';
    return;
  }
  if (store.mode === 'cloud' && !store.user) return renderLogin();
  $('#tabbar').hidden = r === 'print';
  $('#fab').hidden = r !== 'jobs';
  const key = location.hash;
  if (!force && key === lastKey && ['job', 'fix'].includes(r) && document.activeElement && view.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  lastKey = key;
  ({ jobs: renderJobs, job: () => renderJob(a), fix: () => renderFix(a, +b), print: () => renderPrint(a), materials: renderMaterials, grain: renderGrain, settings: renderSettings }[r] || renderJobs)();
}
subscribe(() => render());

function syncBadge() {
  if (store.mode !== 'cloud') return '<span class="sync">이 기기에만 저장</span>';
  if (!store.online || store.pending) return `<span class="sync off">${ic('cloud')} 오프라인${store.pending ? ` · 올릴 변경 ${store.pending}` : ''}</span>`;
  return '';
}

/* ---------- 로그인 ---------- */
function renderLogin() {
  $('#tabbar').hidden = true;
  $('#fab').hidden = true;
  view.innerHTML = `
    <div class="login">
      <div class="logo">${ic('drop')}</div>
      <h1>하이집수리 복원조색</h1>
      <p class="lead">견적 앱과 같은 계정으로 로그인하세요.</p>
      <label class="field"><span>이메일</span><input id="lg-email" type="email" autocomplete="username" /></label>
      <label class="field"><span>비밀번호</span><input id="lg-pw" type="password" autocomplete="current-password" /></label>
      <button class="btn block" id="lg-btn">로그인</button>
      <p class="hint">한 번 로그인하면 계속 유지됩니다.</p>
    </div>`;
  $('#lg-btn').onclick = async () => {
    try {
      await login($('#lg-email').value.trim(), $('#lg-pw').value);
    } catch (e) {
      alert('로그인 실패: 이메일과 비밀번호를 확인해 주세요.');
    }
  };
}

/* ================= ① 조색 작업 목록 ================= */
const jobTitle = (j) => j.title || `${j.sub || j.surface || '조색'} ${md(j.createdAt?.slice(0, 10) || today())}`;
function jobColors(j) {
  const pts = (j.points || []).filter((p) => p.kind !== 'card');
  return pts.slice(0, 8).map((p) => `<i style="background:${esc(p.hex)}"></i>`).join('');
}

function renderJobs() {
  const list = store.state.jobs
    .filter((j) => matches(`${jobTitle(j)} ${(j.tags || []).join(' ')} ${j.surface} ${j.sub} ${j.note || ''}`, ui.q))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  view.innerHTML = `
    <div class="hd"><div class="grow"><p class="eyebrow">하이집수리</p><h1>복원 조색</h1></div>${syncBadge()}
      <button class="icon-btn" data-go="#settings" aria-label="설정">${ic('gear')}</button></div>
    <label class="search">${ic('search')}<input id="q" placeholder="제품명·단지명·색 이름으로 찾기" value="${esc(ui.q)}" /></label>
    ${list.length ? `<div class="list">${list.map((j) => `
      <button class="li" data-go="#job/${j.id}">
        <div class="pal">${jobColors(j) || '<i></i>'}</div>
        <div class="grow"><div class="t1 ell">${esc(jobTitle(j))}${j.saved ? '<span class="pill green">레시피</span>' : ''}</div>
        <div class="t2">${esc([j.surface, j.sub, ...(j.tags || [])].filter(Boolean).join(' · '))} · ${md((j.updatedAt || '').slice(0, 10))}</div></div>
      </button>`).join('')}</div>`
      : `<div class="empty">${ui.q ? '찾는 기록이 없습니다' : '아직 조색 기록이 없습니다.<br>아래 <b>새 조색</b>을 눌러 사진부터 올려 보세요.'}</div>`}
    ${howCard()}`;
  const q = $('#q');
  q.oninput = () => {
    ui.q = q.value;
    const pos = q.selectionStart;
    renderJobs();
    const nq = $('#q');
    nq.focus();
    nq.setSelectionRange(pos, pos);
  };
}

function howCard() {
  return `<div class="card how">
    <h3>이렇게 씁니다</h3>
    <ol class="steps-pic">
      <li><b>1</b><span>소재 고르고<br>사진 올리기</span></li>
      <li><b>2</b><span>주변 판을<br>톡톡 찍기</span></li>
      <li><b>3</b><span>판별 4단<br>레시피 받기</span></li>
      <li><b>4</b><span>시험칠 찍고<br>보정하기</span></li>
    </ol>
    ${layerDiagram({ base: '#d9a76a', toner: '#b5502e', finishName: '반광·유광' })}
  </div>`;
}

async function newJob() {
  const id = newId('j');
  await save('jobs', { id, surface: '마루', sub: '원목마루', status: '진행', points: [], photos: [], fixes: [], tags: [] });
  go('#job/' + id);
}

/* ================= ② 조색 작업 ================= */
const findJob = (id) => store.state.jobs.find((j) => j.id === id);
const boardPoints = (j) => (j.points || []).filter((p) => p.kind !== 'card');
const pointHex = (j, no) => boardPoints(j).find((p) => p.no === no)?.hex;
const mainPhoto = (j) => (j.photos || []).find((p) => p.id === j.mainPhotoId) || (j.photos || []).find((p) => p.stage === '현장');
const canvasCache = new Map();
async function canvasFor(photo) {
  if (!canvasCache.has(photo.path)) canvasCache.set(photo.path, await photoCanvas(photo.path));
  return canvasCache.get(photo.path);
}

// 사진 찍기 단계: ① 기준 카드 → ② 주변 판 → ③ 계산. 지금 할 단계를 크게 보여줌
function tapSteps(j) {
  const n = boardPoints(j).length;
  const card = !!j.cardHex;
  const now = ui.tapMode === 'card' ? 1 : n ? 3 : 2;
  const step = (k, label, done) => `<span class="tstep ${done ? 'done' : ''} ${now === k ? 'now' : ''}">${done ? '✓' : k}<b>${label}</b></span>`;
  const msg = now === 1 ? '사진 속 카드 가운데를 한 번 누르세요'
    : n ? `판 ${n}개를 찍었습니다. 더 누르거나 아래에서 <b>계산으로 레시피 짜기</b>를 누르세요`
    : `${card ? '기준 카드 완료. ' : ''}이제 <b>주변 판을 하나씩 톡톡</b> 누르세요 (1, 2, 3 번호가 붙어요)`;
  return `<div class="tsteps">${step(1, '기준 카드', card)}${step(2, `주변 판${n ? ` ${n}개` : ''}`, n > 0)}${step(3, '계산', !!j.recipe)}</div>
    <div class="tnext ${now === 2 ? 'hot' : ''}">${msg}</div>`;
}

function renderJob(id) {
  const j = findJob(id);
  if (!j) return (view.innerHTML = '<div class="empty">기록을 찾을 수 없습니다</div>');
  const surf = SURFACES.find((s) => s.k === j.surface) || SURFACES[0];
  const mp = mainPhoto(j);
  const pts = j.points || [];
  view.innerHTML = `
    <div class="hd sub"><button class="icon-btn" data-go="#jobs">${ic('back')}</button><h1 class="grow">${esc(jobTitle(j))}</h1>
      <button class="icon-btn" id="j-more" aria-label="더보기">${ic('edit')}</button></div>

    <div class="sec-title"><span class="stepn">1</span>소재</div>
    <div class="card">
      ${chipRow('surface', SURFACES.map((s) => s.k), j.surface)}
      <div style="height:8px"></div>
      ${chipRow('sub', surf.sub, j.sub)}
    </div>

    <div class="sec-title"><span class="stepn">2</span>사진·판 찍기 <span class="r">${pts.filter((p) => p.kind !== 'card').length}개 판</span></div>
    <div class="card">
      ${mp ? `
        <div class="seg" id="tapmode">
          <button data-m="board" class="${ui.tapMode === 'board' ? 'on' : ''}">판 찍기</button>
          <button data-m="card" class="${ui.tapMode === 'card' ? 'on' : ''}">기준 카드 찍기</button>
        </div>
        ${tapSteps(j)}
        <p class="hint">${ui.tapMode === 'card' ? '회색 카드가 조명 색을 보정합니다.' : '결 무늬 말고 바탕색 부분을, 조명이 하얗게 비친 곳은 피해서 누르세요.'}</p>
        <div class="photo-tap" id="tap"><img id="tap-img" alt="현장 사진" />${markers(pts, j.targetNo)}</div>
        ${j.cardHex ? `<div class="row small muted" style="margin-top:8px">${swatch(j.cardHex, '기준 카드', '보정 켜짐', 'tiny')}</div>` : '<p class="hint warn">기준 카드를 안 찍으면 색 정확도가 떨어집니다.</p>'}
      ` : `<div class="shot-tips">
          <div><b>${ic('camera')}</b>흰색·회색 카드를 옆에 같이</div>
          <div><b>☀</b>플래시 끄기, 반사 피해 비스듬히</div>
          <div><b>▦</b>손상부 + 주변 판 여러 개가 보이게</div>
        </div>`}
      <div class="btns" style="margin-top:12px">
        <label class="btn ${mp ? 'ghost' : 'accent'}">${ic('camera')}${mp ? '사진 바꾸기' : '사진 올리기'}<input type="file" accept="image/*" id="up-main" hidden /></label>
      </div>
      ${(j.photos || []).filter((p) => p.stage === '현장').length > 1 ? `<div class="thumbs" id="thumbs"></div>` : ''}
      ${boardPoints(j).length ? `<div class="board-list">${boardPoints(j).map((p) => `
        <div class="bl ${p.no === j.targetNo ? 'on' : ''}">
          <span class="no">${p.no}</span><i style="background:${esc(p.hex)}"></i>
          <span class="grow small">${esc(boardName(j, p.no) || p.hex)}${p.glare > 0.15 ? ' <span class="pill red">반사 많음</span>' : ''}</span>
          <button class="chip sm ${p.no === j.targetNo ? 'on' : ''}" data-target="${p.no}">${p.no === j.targetNo ? '보수 기준' : '기준으로'}</button>
          <button class="icon-btn" data-delpt="${p.no}" aria-label="삭제">${ic('x')}</button>
        </div>`).join('')}</div>` : ''}
    </div>

    <div class="sec-title"><span class="stepn">3</span>판별 4단 레시피</div>
    <div id="recipe">${recipeBlock(j)}</div>

    <div class="sec-title"><span class="stepn">4</span>저장</div>
    <div class="card">
      <label class="field"><span>이름 (제품명·색 이름)</span><input id="j-title" value="${esc(j.title || '')}" placeholder="예: 체리 원목마루 거실" /></label>
      <label class="field"><span>단지명·태그 (쉼표로 구분)</span><input id="j-tags" value="${esc((j.tags || []).join(', '))}" placeholder="예: 래미안, 거실" /></label>
      <label class="field"><span>메모</span><textarea id="j-note" placeholder="현장 상황, 잘 된 점, 다음엔 다르게 할 점">${esc(j.note || '')}</textarea></label>
      <label class="check"><input type="checkbox" id="j-saved" ${j.saved ? 'checked' : ''} /> 잘 맞은 레시피로 저장 (다음 현장 참고용)</label>
      <div class="btns" style="margin-top:8px">
        <button class="btn" id="j-save">저장</button>
        ${j.recipe ? `<button class="btn line" data-go="#print/${j.id}">${ic('down')}인쇄·PDF</button>` : ''}
      </div>
    </div>`;

  bindChips(view, 'surface', async (v) => {
    const s = SURFACES.find((x) => x.k === v);
    await save('jobs', { ...findJob(id), surface: v, sub: s.sub[0] });
  });
  bindChips(view, 'sub', (v) => save('jobs', { ...findJob(id), sub: v }));

  $('#up-main').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    toast('사진을 줄여서 저장하는 중…');
    try {
      const ph = await uploadPhoto(id, f, '현장');
      const cur = findJob(id);
      await save('jobs', { ...cur, photos: [...(cur.photos || []), ph], mainPhotoId: ph.id, points: [], cardHex: null, targetNo: null });
      toast('사진을 올렸습니다. 주변 판을 눌러 보세요');
    } catch (err) {
      alert('사진 저장 실패: ' + err.message);
    }
  };

  if (mp) {
    photoUrls([mp.path]).then((u) => { const im = $('#tap-img'); if (im) im.src = u[mp.path]; });
    $$('#tapmode button').forEach((b) => (b.onclick = () => { ui.tapMode = b.dataset.m; doRender(true); }));
    $('#tap').addEventListener('click', async (e) => {
      if (e.target.closest('.mk')) return;
      const img = $('#tap-img');
      const r = img.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const cv = await canvasFor(mp);
      const s = sampleAt(cv, x, y, ui.tapMode === 'card' ? 0.02 : 0.035);
      const cur = findJob(id);
      if (ui.tapMode === 'card') {
        const gain = cardGain(s.hex);
        const points = (cur.points || []).filter((p) => p.kind !== 'card').map((p) => ({ ...p, hex: applyGain(p.raw || p.hex, gain) }));
        await save('jobs', { ...cur, cardHex: s.hex, cardGain: gain, points: [...points, { no: 0, kind: 'card', x, y, hex: s.hex }] });
        ui.tapMode = 'board';
        toast('기준 카드 완료. 이제 주변 판을 눌러 주세요');
      } else {
        const bp = boardPoints(cur);
        const no = bp.length ? Math.max(...bp.map((p) => p.no)) + 1 : 1;
        const hex = applyGain(s.hex, cur.cardGain);
        await save('jobs', { ...cur, points: [...(cur.points || []), { no, kind: 'board', x, y, raw: s.hex, hex, glare: s.glare, photoId: mp.id }], targetNo: cur.targetNo || no });
        if (s.glare > 0.15) toast('조명 반사가 많은 곳입니다. 옆을 다시 눌러 보세요');
      }
    });
  }
  $$('[data-target]').forEach((b) => (b.onclick = () => save('jobs', { ...findJob(id), targetNo: +b.dataset.target })));
  $$('[data-delpt]').forEach((b) => (b.onclick = () => {
    const cur = findJob(id);
    const no = +b.dataset.delpt;
    save('jobs', { ...cur, points: cur.points.filter((p) => p.kind === 'card' || p.no !== no), targetNo: cur.targetNo === no ? null : cur.targetNo });
  }));

  bindRecipe(j);

  $('#j-save').onclick = async () => {
    const cur = findJob(id);
    await save('jobs', {
      ...cur,
      title: $('#j-title').value.trim(),
      tags: $('#j-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      note: $('#j-note').value,
      saved: $('#j-saved').checked,
    });
    toast('저장했습니다');
  };
  $('#j-more').onclick = () => openSheet(`${sheetHead('기록 관리')}
      <button class="btn danger block" id="j-del">${ic('trash')}이 조색 기록 삭제</button>`, (sh) => {
    $('#j-del', sh).onclick = async () => {
      if (!confirm('사진과 레시피가 모두 지워집니다. 삭제할까요?')) return;
      const cur = findJob(id);
      try { await deletePhotos(cur.photos || []); } catch (_) {}
      await remove('jobs', id);
      closeSheet();
      go('#jobs');
    };
  });
}

function boardName(j, no) {
  return j.recipe?.boards?.find((b) => b.no === no)?.name || '';
}

/* ---------- 레시피 ---------- */
function boardColors(j, b) {
  const map = matMap();
  const parts = (b.base?.paints || []).map((p) => ({ hex: map[p.id]?.hex, drops: p.drops, strong: map[p.id]?.strong }));
  const mix = mixPreview(parts);
  const plain = j.recipe?.plain;
  const base = mix ? (plain ? mix : lighten20(parts, BUFF())) : null;
  let toned = base;
  (b.toner?.main || []).forEach((t) => { if (toned && map[t.id]) toned = tonerLayer(toned, map[t.id].hex, t.passes || 1); });
  (b.toner?.adjust || []).forEach((t) => { if (toned && map[t.id]) toned = tonerLayer(toned, map[t.id].hex, 1, 0.21); });
  return { photo: pointHex(j, b.no), target: b.target_hex, mix, base, toned, finished: toned ? (plain ? toned : afterClear(toned)) : null };
}

function recipeBlock(j) {
  const R = j.recipe;
  if (!R) {
    const n = boardPoints(j).length;
    return `<div class="card">
      <p class="muted small">${n ? `${n}개 판의 색을 보고 판마다 바탕 물감 비율, 결 그리기, 토너, 마감을 정해 드립니다.` : '먼저 사진을 올리고 주변 판을 찍어 주세요.'}</p>
      <div class="btns"><button class="btn accent" id="r-calc">${ic('drop')}계산으로 레시피 짜기</button>
      <button class="btn line" id="r-manual">직접 입력</button>
      ${aiOn() ? `<button class="btn line" id="r-ai" ${n && aiReady() ? '' : 'disabled'}>${ic('spark')}AI 레시피</button>` : ''}</div>
    </div>`;
  }
  const map = matMap();
  const fin = map[R.finish?.id];
  return `
    <div class="card">
      <h3>${ic('spark')}판단 <span class="r">${({ ai: 'AI', import: '가져온 레시피', calc: '계산' })[R.source] || '직접 입력'}</span></h3>
      ${R.analysis ? `<p class="note">${esc(R.analysis.summary || '')}</p>
      <div class="tags" style="margin-top:8px">${[R.analysis.material, R.analysis.gloss && '광택 ' + R.analysis.gloss].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      ${R.analysis.putty ? `<p class="small" style="margin:10px 0 0"><b>밑작업</b> ${esc(R.analysis.putty)}</p>` : ''}
      ${(R.analysis.issues || []).length ? `<ul class="bul warn">${R.analysis.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}` : ''}
      ${layerDiagram({ base: boardColors(j, R.boards[0] || {}).base, grain: null, toner: map[R.boards[0]?.toner?.main?.[0]?.id]?.hex, finishName: fin ? matName(fin) : '마감' })}
      ${fin ? `<div class="finish"><div class="st-h"><b>④</b> 마감 ${swatch(fin.hex, matName(fin), fin.gloss || '', 'tiny')}</div><p class="small muted">${esc(R.finish.reason || '')}</p>${glossTips()}</div>` : ''}
    </div>
    <div class="seg" id="r-view" style="margin-bottom:10px">
      <button data-v="cards" class="${ui.table ? '' : 'on'}">판별 카드</button>
      <button data-v="table" class="${ui.table ? 'on' : ''}">한눈 표</button>
    </div>
    ${ui.table ? recipeTable(j) : R.boards.map((b) => boardCard(j, b)).join('')}
    ${(R.tips || []).length ? `<div class="card"><h3>요령</h3><ul class="bul">${R.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${(R.missing || []).length ? `<div class="card"><h3>${ic('cart')}있으면 좋은 재료</h3>${R.missing.map((m) => `
      <div class="miss"><b>${esc(m.name)}</b><p class="small muted">${esc(m.why)}</p>
      <div class="btns"><a class="btn sm line" target="_blank" rel="noopener" href="https://search.shopping.naver.com/search/all?query=${encodeURIComponent(m.search || m.name)}">네이버쇼핑</a>
      <a class="btn sm line" target="_blank" rel="noopener" href="https://www.coupang.com/np/search?q=${encodeURIComponent(m.search || m.name)}">쿠팡</a></div></div>`).join('')}</div>` : ''}
    <div class="btns" style="margin-bottom:12px">
      <button class="btn line" id="r-calc">${ic('drop')}다시 계산</button>
      ${aiOn() ? `<button class="btn line" id="r-ai" ${aiReady() && boardPoints(j).length ? '' : 'disabled'}>${ic('spark')}AI로 다시 받기</button>` : ''}
      <button class="btn line" id="r-recover">진해졌을 때</button>
    </div>`;
}

function paintRows(b) {
  const map = matMap();
  return (b.base?.paints || [])
    .filter((p) => p.drops > 0)
    .sort((x, y) => y.drops - x.drops)
    .map((p) => {
      const m = map[p.id];
      return `<div class="pr"><i class="dot" style="background:${esc(m?.hex || '#ccc')}"></i><span class="pn">${esc(matName(m))}${m && !owned(m) ? ' <span class="pill red">없음</span>' : ''}</span>${drops(m?.hex || '#ccc', p.drops)}<b class="pd">${fmtDrops(p.drops)}</b></div>`;
    })
    .join('');
}

function boardCard(j, b) {
  const map = matMap();
  const c = boardColors(j, b);
  // 목표는 완성된 마루 색이므로, 토너·마감까지 올린 예상 색과 비교
  const de = (c.photo || c.target) && c.finished ? deltaE(c.photo || c.target, c.finished) : null;
  const tonerMain = b.toner?.main || [];
  return `<div class="card board" id="board-${b.no}">
    <h3><span class="no">${b.no}</span>${esc(b.name || '')}<span class="r">${b.no === j.targetNo ? '보수 기준' : ''}</span></h3>
    ${swatchFlow([
      { hex: c.photo || c.target, label: c.photo ? '사진 속 판' : '목표색', sub: c.photo ? '측정' : '대략' },
      { hex: c.mix, label: '섞은 색', sub: '예상' },
      { hex: c.base, label: '바탕', sub: '+버프 20%' },
      { hex: c.finished, label: '완성', sub: de != null ? `예상 · 목표와 ${deLabel(de)}` : '토너·마감 후' },
    ])}
    <p class="ref">예상 색은 물감 대략 색으로 계산한 참고용입니다.</p>

    <div class="stage"><div class="st-h"><b>①</b> 아크릴 바탕 <small>목표 조합 → 타이탄버프 20% 더 넣어 한 톤 밝게</small></div>
      ${paintRows(b) || '<p class="muted small">물감이 없습니다. 수정을 눌러 넣어 주세요.</p>'}
      ${b.base?.note ? `<p class="small muted">${esc(b.base.note)}</p>` : ''}
    </div>

    <div class="stage"><div class="st-h"><b>②</b> 결 그리기</div>
      ${(b.grain || []).length ? `<div class="grain-row">${b.grain.map((g) => {
        const G = GRAIN.find((x) => x.k === g.pattern) || GRAIN[0];
        const tool = map[g.tool_id];
        return `<button class="gcard" data-guide="${G.k}">${grainSvg(G.k, c.base || '#c8894e', tool?.kind === 'pen' ? tool.hex : null)}
          <b>${esc(G.name)}</b><small>${esc(tool ? tool.name : G.tool)}</small>${g.how ? `<span>${esc(g.how)}</span>` : ''}</button>`;
      }).join('')}</div>` : '<p class="muted small">결 안내가 없습니다.</p>'}
    </div>

    <div class="stage"><div class="st-h"><b>③</b> 토너 <small>얇게, 마를 때마다 확인</small></div>
      ${tonerMain.map((t) => { const m = map[t.id]; return m ? `<div class="pr"><i class="dot sq" style="background:${esc(m.hex)}"></i><span class="pn">${esc(matName(m))}${!owned(m) ? ' <span class="pill red">없음</span>' : ''}</span><b class="pd">${t.passes || 1}회</b></div>${c.base ? tonerSteps(c.base, m, t.passes || 1) : ''}` : ''; }).join('')}
      ${(b.toner?.adjust || []).map((t) => { const m = map[t.id]; return m ? `<div class="pr adj"><i class="dot sq" style="background:${esc(m.hex)}"></i><span class="pn">보정 ${esc(matName(m))}${!owned(m) ? ' <span class="pill red">없음</span>' : ''}</span><small class="muted">${esc(t.how || '한 번 스치듯')}</small></div>` : ''; }).join('')}
    </div>

    <div class="btns"><button class="btn sm ghost" data-edit="${b.no}">${ic('edit')}수정</button>
      <button class="btn sm accent" data-go="#fix/${j.id}/${b.no}">시험칠·보정</button></div>
  </div>`;
}

function recipeTable(j) {
  const R = j.recipe;
  const map = matMap();
  const totals = {};
  R.boards.forEach((b) => (b.base?.paints || []).forEach((p) => (totals[p.id] = (totals[p.id] || 0) + p.drops)));
  const ids = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const cell = (b, id) => { const p = (b.base?.paints || []).find((x) => x.id === id); return p && p.drops ? `<td>${+(+p.drops).toFixed(1)}</td>` : '<td class="none">–</td>'; };
  // 토너는 번호와 색상명을 같이 (좁은 칸이라 두 줄로)
  const tn = (t) => { const m = map[t.id]; return m ? `<span class="tn"><b>${esc(m.code || '')}${t.passes > 1 ? ` ×${t.passes}` : ''}</b><small>${esc(m.name)}</small></span>` : ''; };
  return `<div class="card tbl-wrap"><table class="rtable">
    <thead><tr><th>물감</th>${R.boards.map((b) => `<th><span class="no">${b.no}</span><i style="background:${esc(boardColors(j, b).photo || b.target_hex || '#ccc')}"></i></th>`).join('')}</tr></thead>
    <tbody>${ids.map((id) => `<tr><th><i class="dot" style="background:${esc(map[id]?.hex || '#ccc')}"></i>${esc(map[id]?.name || id)}</th>${R.boards.map((b) => cell(b, id)).join('')}</tr>`).join('')}
    <tr class="tsep"><th>토너</th>${R.boards.map((b) => `<td>${(b.toner?.main || []).map(tn).join('')}</td>`).join('')}</tr>
    <tr><th>보정</th>${R.boards.map((b) => `<td>${(b.toner?.adjust || []).map(tn).join('')}</td>`).join('')}</tr></tbody>
  </table><p class="ref">숫자는 방울 수, 0.1~0.3은 이쑤시개 끝. 바탕은 타이탄버프 20% 더.</p></div>`;
}

function bindRecipe(j) {
  const id = j.id;
  $$('#r-view button').forEach((b) => (b.onclick = () => { ui.table = b.dataset.v === 'table'; $('#recipe').innerHTML = recipeBlock(findJob(id)); bindRecipe(findJob(id)); }));
  $$('[data-guide]').forEach((b) => (b.onclick = () => openGrainSheet(b.dataset.guide, findJob(id))));
  $$('[data-edit]').forEach((b) => (b.onclick = () => editBoard(id, +b.dataset.edit)));
  // 판을 안 찍었으면 계산 대신 알려 주고 사진으로 데려감
  const needBoards = () => {
    const cur = findJob(id);
    if (boardPoints(cur).length) return false;
    const photo = $('#tap');
    toast(photo ? '사진에서 주변 판을 눌러 주세요' : '먼저 사진을 올려 주세요');
    const el = photo || $('#up-main')?.closest('.btn');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('nudge');
      void el.offsetWidth;
      el.classList.add('nudge');
    }
    return true;
  };
  const calc = $('#r-calc');
  if (calc) calc.onclick = () => { if (!needBoards()) calcSheet(id); };
  const rec = $('#r-recover');
  if (rec) rec.onclick = recoverySheet;
  const man = $('#r-manual');
  if (man) man.onclick = async () => {
    if (needBoards()) return;
    const cur = findJob(id);
    const boards = boardPoints(cur).map((p) => ({ no: p.no, name: '', target_hex: p.hex, base: { paints: [], note: '' }, grain: [], toner: { main: [], adjust: [] } }));
    await save('jobs', { ...cur, recipe: { source: 'manual', boards, finish: { id: 'm-0420', reason: '' }, tips: [], missing: [], at: new Date().toISOString() } });
  };
  const ai = $('#r-ai');
  if (ai) ai.onclick = async () => {
    const cur = findJob(id);
    if (cur.recipe && !confirm('지금 레시피를 AI 새 레시피로 바꿀까요?')) return;
    busy(ai, true, 'AI가 사진을 보는 중… (30초~1분)');
    try {
      const photos = (cur.photos || []).filter((p) => p.stage === '현장').slice(-3);
      const images = [];
      for (const p of photos) images.push(await photoBase64(p.path));
      const past = store.state.jobs
        .filter((x) => x.saved && x.id !== id && x.surface === cur.surface && x.recipe)
        .slice(0, 3)
        .map((x) => ({ title: jobTitle(x), boards: x.recipe.boards.map((b) => ({ name: b.name, target_hex: b.target_hex, base: b.base?.paints, toner: b.toner })) }));
      const res = await askAI({
        mode: 'recipe', surface: cur.surface, sub: cur.sub, images, card: !!cur.cardHex, past, note: cur.note || '',
        boards: boardPoints(cur).map((p) => ({ no: p.no, hex: p.hex, target: p.no === cur.targetNo })),
        materials: ownedList().map((m) => ({ id: m.id, kind: m.kind, name: m.name, code: m.code, hex: m.hex })),
      });
      await save('jobs', { ...findJob(id), recipe: { ...res.result, source: 'ai', at: new Date().toISOString() } });
      toast(`레시피를 받았습니다 (이번 달 ${res.usage.count}/${res.usage.limit}회)`);
    } catch (e) {
      busy(ai, false);
      alert(e.message);
    }
  };
}

// 광택 맞추기 요령 (접었다 펴기)
const glossTips = (open = false) => `<details class="gtips" ${open ? 'open' : ''}><summary>광택 맞추기 요령</summary><ul class="bul">${GLOSS_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;

/* ---------- 계산 레시피 (AI 없이) ---------- */
const L = (hex) => rgbToLab(hexToRgb(hex))[0];
const shadeHex = (hex, k) => rgbToHex(unlin(lin(hexToRgb(hex)).map((v) => v * k)));
const CLEAR_BY_GLOSS = { 유광: 'm-0420', 반광: 'm-0422', 하광: 'm-0421', 무광: 'm-0485' };
const GLOSS_SEEN = { 유광: '조명이 거울처럼 또렷', 반광: '조명이 뿌옇게 번짐', 하광: '살짝 밝아지기만', 무광: '거의 안 비침' };

// 결 무늬별 도구: 결펜 무늬는 바탕보다 1~2톤 진한 색에 가까운 결펜, 이음매는 가장 진한 결펜, 나머지는 세필붓
function grainTool(G, baseHex) {
  const pens = S().pens || [];
  if (!/^결펜/.test(G.tool) || !pens.length) return 't-brush';
  if (G.k === 'seam') return pens.slice().sort((a, b) => L(a.hex) - L(b.hex))[0].id;
  const ink = shadeHex(baseHex, 0.45);
  return pens.slice().sort((a, b) => deltaE(ink, a.hex) - deltaE(ink, b.hex))[0].id;
}

// k: 시험칠로 잰 차이 비율 (없으면 null)
async function calcRecipe(jobId, opt, k, onStep) {
  const cur = findJob(jobId);
  const wood = isWood(cur);
  const map = matMap();
  const pts = boardPoints(cur);
  const targets = pts.map((p) => correctTarget(p.hex, k));
  const ctx = solveCtx(cur);
  const res = await solveJob(targets, ctx, (i, n) => onStep && onStep(`판 ${i}/${n} 계산 중`));
  const missing = [];
  if (wood) {
    // 없는 토너로 확실히 더 가까워지는 판이 있는지
    const all = solveCtx(cur, true);
    const better = {};
    for (let i = 0; i < targets.length; i++) {
      onStep && onStep(`없는 재료 확인 ${i + 1}/${targets.length}`);
      await yieldUI();
      const r = solveBoard(targets[i], all);
      const m = r.toner && map[r.toner.id];
      if (m && !owned(m) && r.de < res[i].de - 1.5) (better[m.id] = better[m.id] || []).push(pts[i].no);
    }
    Object.entries(better).forEach(([id, nos]) => missing.push({ name: `모호크 ${map[id].code} ${map[id].name}`, why: `${nos.join(', ')}번 판이 계산상 더 가까워집니다.`, search: `모호크 ${map[id].code} ${map[id].name}` }));
  }
  let finish = null;
  if (wood) {
    let fid = CLEAR_BY_GLOSS[opt.gloss] || 'm-0420';
    let reason = `주변 광택이 ${opt.gloss}이라서`;
    if (!owned(map[fid])) {
      const fm = map[fid];
      const alt = opt.gloss === '반광' ? 'm-0421' : 'm-0420';
      reason += ` — ${fm.code} ${fm.name}이 없어 ${map[alt].code} ${map[alt].name}로 대신합니다. 주변과 광택을 비교하세요.`;
      missing.push({ name: `모호크 ${fm.code} ${fm.name}`, why: '주변 광택과 맞추는 투명 마감', search: `모호크 ${fm.code} ${fm.name}` });
      fid = alt;
    }
    finish = { id: fid, reason };
  }
  const boards = pts.map((p, i) => {
    const r = res[i];
    const old = cur.recipe?.boards?.find((b) => b.no === p.no);
    const parts = r.paints.map((x) => ({ hex: map[x.id].hex, drops: x.drops, strong: map[x.id].strong }));
    const baseHex = (wood ? lighten20(parts, BUFF()) : mixPreview(parts)) || p.hex;
    const grain = (opt.grain || []).map((n) => GRAIN.find((g) => g.name === n)).filter(Boolean).map((G) => ({ pattern: G.k, tool_id: grainTool(G, baseHex), how: G.steps[0] }));
    return { no: p.no, name: old?.name || '', target_hex: p.hex, base: { paints: r.paints, note: '' }, grain, toner: { main: r.toner ? [r.toner] : [], adjust: r.adjust ? [r.adjust] : [] } };
  });
  const used = [...new Set(res.filter((r) => r.toner).map((r) => matName(map[r.toner.id])))];
  const avg = res.reduce((a, r) => a + r.de, 0) / (res.length || 1);
  const tips = [
    `먼저 보수 기준 판(${cur.targetNo || pts[0]?.no}번)으로 시험칠하고, 시험칠·보정에서 사진을 찍으세요. 그 차이로 나머지 판도 한 번에 다시 계산할 수 있습니다.`,
    ...(wood ? TONER_TIPS.slice(0, 3) : []),
  ];
  const summary = `가진 재료로 계산한 레시피입니다. 판 ${pts.length}개${used.length ? ` · 토너 ${used.join(', ')}` : ''} · 계산상 목표와 평균 ΔE ${avg.toFixed(1)}.${k ? ' 시험칠로 잰 차이를 반영했습니다.' : ''}`;
  const now = findJob(jobId);
  await save('jobs', {
    ...now,
    calib: k ? { k, at: new Date().toISOString() } : now.calib || null,
    recipe: { source: 'calc', plain: !wood, calcOpt: opt, analysis: { summary, gloss: wood ? opt.gloss : '' }, boards, finish, tips, missing, at: new Date().toISOString() },
  });
}

function calcSheet(jobId) {
  const j = findJob(jobId);
  const wood = isWood(j);
  const opt = { grain: wood ? ['곧은결', '판 이음매'] : [], gloss: '유광', ...(j.recipe?.calcOpt || {}) };
  const sh = openSheet(`${sheetHead('계산으로 레시피 짜기')}
    <p class="hint">가진 물감·토너만으로, ${wood ? '토너·마감까지 올린' : '칠한'} 예상 색이 사진 속 판과 가장 가까운 조합을 찾습니다. 비용 없이 휴대폰 안에서 계산합니다.</p>
    ${wood ? `<div class="field"><span>주변 결 무늬 (여러 개 고르기)</span>${chipRow('cg', GRAIN.map((g) => g.name), opt.grain, true)}</div>
    <div class="field"><span>주변 광택 <button type="button" class="linkbtn" id="c-gh">어떻게 고르나요?</button></span>${chipRow('cl', GLOSS, opt.gloss)}
      <p class="hint" id="c-guess"></p>
      <div id="c-gguide" class="gguide" hidden>
        <p class="small">마루에 <b>낮게 쪼그려 앉아</b> 천장 조명이 바닥에 어떻게 비치는지 보고, 가장 비슷한 그림을 누르세요.</p>
        <div class="ggrid">${GLOSS.map((g) => { const m = matMap()[CLEAR_BY_GLOSS[g]]; return `<button type="button" class="gpick" data-gloss="${g}">${glossSvg(g, pointHex(j, j.targetNo) || '#a8784a')}
          <b>${g}</b><small>${GLOSS_SEEN[g]}</small><small class="muted">${esc(matName(m))}${esc(m.gloss.replace(/^\S+\s/, ''))}${owned(m) ? '' : ' · <span class="pill red">없음</span>'}</small></button>`; }).join('')}</div>
        ${glossTips(true)}
      </div></div>` : ''}
    ${j.calib ? `<label class="check"><input type="checkbox" id="c-k" checked /> 지난 시험칠로 잰 차이 반영</label>` : ''}
    <p class="ref">예상 색은 물감 대략 색으로 계산한 참고용입니다. 시험칠 한 번으로 차이를 재서 다시 맞춥니다.</p>
    <div class="foot"><button class="btn accent block" id="c-go">${ic('drop')}계산하기</button></div>`);
  bindChips(sh, 'cg', (v) => (opt.grain = v));
  bindChips(sh, 'cl', (v) => (opt.gloss = v));
  const pickGloss = (g) => $(`[data-chips="cl"] button[data-v="${g}"]`, sh)?.click();
  if (wood) {
    $('#c-gh', sh).onclick = () => ($('#c-gguide', sh).hidden = !$('#c-gguide', sh).hidden);
    $$('[data-gloss]', sh).forEach((b) => (b.onclick = () => { pickGloss(b.dataset.gloss); $('#c-gguide', sh).hidden = true; }));
    // 사진 반사로 짐작 (처음 계산할 때만 미리 골라 둠 — 눈으로 보고 바꾸면 그게 우선)
    const mp = mainPhoto(j);
    if (mp) canvasFor(mp).then((cv) => {
      const card = (j.points || []).find((p) => p.kind === 'card');
      // 찍은 판들을 감싸는 범위만 봄 (마루 밖 물건 빼기)
      const bp = boardPoints(j).filter((p) => !p.photoId || p.photoId === mp.id);
      const roi = bp.length >= 2 ? {
        x0: Math.max(0, Math.min(...bp.map((p) => p.x)) - 0.1), x1: Math.min(1, Math.max(...bp.map((p) => p.x)) + 0.1),
        y0: Math.max(0, Math.min(...bp.map((p) => p.y)) - 0.1), y1: Math.min(1, Math.max(...bp.map((p) => p.y)) + 0.1),
      } : null;
      const g = estimateGloss(cv, card && { x: card.x, y: card.y }, roi);
      const el = $('#c-guess', sh);
      if (!g || !el) return;
      el.innerHTML = `사진상 짐작: <b>${g.level}</b> — ${g.why}. 각도에 따라 틀릴 수 있으니 눈으로 확인하세요.`;
      if (!j.recipe?.calcOpt) pickGloss(g.level);
    }).catch(() => {});
  }
  $('#c-go', sh).onclick = async (e) => {
    const btn = e.currentTarget;
    const cur = findJob(jobId);
    if (cur.recipe && cur.recipe.source !== 'calc' && !confirm('지금 레시피를 계산한 새 레시피로 바꿀까요?')) return;
    busy(btn, true, '계산하는 중…');
    try {
      const useK = $('#c-k', sh) ? $('#c-k', sh).checked : false;
      await calcRecipe(jobId, opt, useK ? cur.calib.k : null, (t) => (btn.lastChild.textContent = t));
      closeSheet();
      toast('레시피를 계산했습니다');
    } catch (err) {
      busy(btn, false);
      alert('계산 실패: ' + err.message);
    }
  };
}

function editBoard(jobId, no) {
  const j = findJob(jobId);
  const b = j.recipe.boards.find((x) => x.no === no);
  const own = ownedList();
  const paints = own.filter((m) => m.kind === 'paint');
  const toners = own.filter((m) => m.kind === 'toner');
  const dv = (id) => (b.base?.paints || []).find((p) => p.id === id)?.drops || '';
  const tsel = (name, val) => `<select class="input" data-t="${name}"><option value="">없음</option>${toners.map((t) => `<option value="${t.id}" ${t.id === val ? 'selected' : ''}>${esc(matName(t))}</option>`).join('')}</select>`;
  const m1 = b.toner?.main?.[0], m2 = b.toner?.main?.[1], a1 = b.toner?.adjust?.[0];
  const sh = openSheet(`${sheetHead(`판 ${no} 수정`)}
    <label class="field"><span>색 이름</span><input id="e-name" value="${esc(b.name || '')}" placeholder="예: 진한 호박 오렌지" /></label>
    <div class="field"><span>① 바탕 물감 (방울 · 이쑤시개 끝은 0.2)</span>
      <div class="pgrid">${paints.map((p) => `<label class="pin"><i class="dot" style="background:${esc(p.hex)}"></i><span>${esc(p.name)}</span><input inputmode="decimal" data-p="${p.id}" value="${dv(p.id)}" placeholder="0" /></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><span class="small muted">예상 색</span><span id="e-prev"></span></div>
    </div>
    <div class="field"><span>③ 메인 토너</span><div class="grid2">${tsel('m1', m1?.id)}<input class="input" id="e-m1p" inputmode="numeric" value="${m1?.passes || 1}" placeholder="회" /></div>
      <div class="grid2" style="margin-top:6px">${tsel('m2', m2?.id)}<input class="input" id="e-m2p" inputmode="numeric" value="${m2?.passes || 1}" placeholder="회" /></div></div>
    <div class="field"><span>보정 토너 (한 번 스치듯)</span>${tsel('a1', a1?.id)}</div>
    <div class="foot"><button class="btn block" id="e-save">저장</button></div>`);
  const read = () => $$('[data-p]', sh).map((i) => ({ id: i.dataset.p, drops: parseFloat(i.value) || 0 })).filter((p) => p.drops > 0);
  const prev = () => {
    const map = matMap();
    const mx = mixPreview(read().map((p) => ({ hex: map[p.id].hex, drops: p.drops, strong: map[p.id].strong })));
    $('#e-prev', sh).innerHTML = mx ? swatch(mx, '', '', 'tiny') + (pointHex(j, no) ? swatch(pointHex(j, no), '', '사진', 'tiny') : '') : '<span class="muted small">물감을 넣으면 보입니다</span>';
  };
  $$('[data-p]', sh).forEach((i) => (i.oninput = prev));
  prev();
  $('#e-save', sh).onclick = async () => {
    const tv = (n) => $(`[data-t="${n}"]`, sh).value;
    const main = [[tv('m1'), $('#e-m1p', sh).value], [tv('m2'), $('#e-m2p', sh).value]].filter((x) => x[0]).map(([id, n]) => ({ id, passes: parseInt(n) || 1 }));
    const nb = { ...b, name: $('#e-name', sh).value.trim(), base: { ...(b.base || {}), paints: read() }, toner: { main, adjust: tv('a1') ? [{ id: tv('a1'), how: a1?.id === tv('a1') ? a1.how : '한 번 스치듯' }] : [] } };
    const cur = findJob(jobId);
    await save('jobs', { ...cur, recipe: { ...cur.recipe, boards: cur.recipe.boards.map((x) => (x.no === no ? nb : x)) } });
    closeSheet();
    toast('수정했습니다');
  };
}

function recoverySheet() {
  openSheet(`${sheetHead('진해졌거나 잘못됐을 때')}
    <div class="recover-pic">
      <div>${swatch('#9a5a2c', '진해진 토너', '')}</div><span class="arr">+</span>
      <div>${swatch(tonerLayer('#9a5a2c', '#d2b48a', 1), '밝은 토너 덧뿌림', '더 탁해질 뿐')}</div>
    </div>
    <p class="note small muted">토너는 셀로판지처럼 겹칠수록 진해집니다. 밝은 색을 덮어도 밝아지지 않습니다.</p>
    <div class="list">${RECOVERY.map((r) => `<div class="li"><div class="grow"><div class="t1">${esc(r.when)}</div><div class="small">${esc(r.what)}</div></div></div>`).join('')}</div>`);
}

/* ================= ③ 시험칠·보정 ================= */
function renderFix(jobId, no) {
  const j = findJob(jobId);
  const b = j?.recipe?.boards?.find((x) => x.no === no);
  if (!b) return (view.innerHTML = '<div class="empty">레시피를 찾을 수 없습니다</div>');
  const target = pointHex(j, no) || b.target_hex;
  const draft = (ui.fix && ui.fix.job === jobId && ui.fix.no === no) ? ui.fix : (ui.fix = { job: jobId, no, feelings: [], stage: '바탕', note: '' });
  const ph = draft.photoId && (j.photos || []).find((p) => p.id === draft.photoId);
  // 바탕·토너 단계 시험칠은 끝냈을 때 예상 색으로 비교 (바탕은 일부러 한 톤 밝음)
  const eq = draft.testHex ? finalFromTest(draft.testHex, draft.stage, boardColors(j, b)) : null;
  const de = eq ? deltaE(target, eq) : null;
  const dir = eq ? direction(target, eq) : [];
  const hist = (j.fixes || []).filter((f) => f.boardNo === no).slice().reverse();
  view.innerHTML = `
    <div class="hd sub"><button class="icon-btn" data-go="#job/${jobId}">${ic('back')}</button><h1 class="grow">판 ${no} 시험칠·보정</h1></div>
    <div class="card">
      <h3>${esc(b.name || '목표 판')}</h3>
      <div class="compare">
        ${swatch(target, '목표 (원래 판)', '', 'big')}
        <span class="vs">vs</span>
        ${draft.testHex ? swatch(draft.testHex, `시험칠 (${draft.stage})`, '', 'big') : '<div class="sw big empty-sw"><i></i><b>시험칠</b><small>사진을 찍어 주세요</small></div>'}
        ${eq && draft.stage !== '마감' ? `<span class="vs">→</span>${swatch(eq, '끝내면', `ΔE ${de.toFixed(1)} · ${deLabel(de)}`, 'big')}` : ''}
      </div>
      ${eq && draft.stage === '마감' ? `<p class="small muted" style="margin:6px 0 0">ΔE ${de.toFixed(1)} · ${deLabel(de)}</p>` : ''}
      ${eq && draft.stage !== '마감' ? '<p class="ref">끝내면 = 이 시험칠에 남은 단계(토너·마감)를 올렸을 때 예상 색. 바탕은 일부러 한 톤 밝게 칠합니다.</p>' : ''}
      ${dir.length ? `<div class="dirs">${dir.map((d) => `<span class="dir">${dirIcon(d)}${esc(d)}</span>`).join('')}</div>` : draft.testHex ? '<p class="hint">사진상 거의 같습니다. 눈으로도 확인해 보세요.</p>' : ''}
    </div>

    <div class="card">
      <h3>${ic('camera')}시험칠 사진</h3>
      <p class="hint">마른 상태에서, 원래 판 옆에 시험칠을 두고 기준 카드와 함께 찍으세요.</p>
      ${ph ? `<div class="photo-tap" id="ftap"><img id="ftap-img" alt="시험칠 사진" />${draft.x != null ? `<span class="mk on" style="left:${draft.x * 100}%;top:${draft.y * 100}%;--c:${esc(draft.testHex)}">시</span>` : ''}${draft.cx != null ? `<span class="mk card" style="left:${draft.cx * 100}%;top:${draft.cy * 100}%">기준</span>` : ''}</div>
        <div class="seg" id="fmode" style="margin-top:8px"><button data-m="test" class="${draft.mode !== 'card' ? 'on' : ''}">시험칠 누르기</button><button data-m="card" class="${draft.mode === 'card' ? 'on' : ''}">기준 카드 누르기</button></div>` : ''}
      <label class="btn ${ph ? 'ghost' : 'accent'} block" style="margin-top:10px">${ic('camera')}${ph ? '다른 사진' : '사진 올리기'}<input type="file" accept="image/*" id="f-up" hidden /></label>
    </div>

    <div class="card">
      <h3>눈으로 보면?</h3>
      ${chipRow('feel', FEELINGS, draft.feelings, true)}
      <p class="hint">사진과 눈이 다르면 눈으로 본 것을 따릅니다.</p>
      <div class="field" style="margin-top:12px"><span>지금 단계</span>${chipRow('stage', STAGES, draft.stage)}</div>
      <label class="field"><span>메모</span><input id="f-note" value="${esc(draft.note)}" placeholder="예: 토너 2회 뿌렸더니 어두워짐" /></label>
      ${draft.stage === '토너' && draft.feelings.includes('더 밝게') ? `<div class="alert red" style="margin-bottom:10px">토너가 진해졌다면 덧뿌려서는 못 밝힙니다</div>` : ''}
      <button class="btn accent block" id="f-calc">${ic('drop')}계산으로 보정</button>
      ${aiOn() ? `<button class="btn line block" id="f-ai" style="margin-top:8px" ${aiReady() ? '' : 'disabled'}>${ic('spark')}AI 보정 받기</button>` : ''}
      <button class="btn line block" id="f-quick" style="margin-top:8px">바로 보는 보정 요령</button>
    </div>

    ${hist.length ? `<div class="sec-title">보정 기록</div>${hist.map((f) => fixCard(j, f)).join('')}` : ''}`;

  const redraw = () => doRender(true);
  bindChips(view, 'feel', (v) => { draft.feelings = v; });
  bindChips(view, 'stage', (v) => { draft.stage = v; redraw(); });
  $('#f-note').oninput = (e) => (draft.note = e.target.value);
  $('#f-up').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    toast('사진을 저장하는 중…');
    try {
      const p = await uploadPhoto(jobId, f, '시험칠');
      const cur = findJob(jobId);
      await save('jobs', { ...cur, photos: [...(cur.photos || []), p] });
      Object.assign(draft, { photoId: p.id, x: null, y: null, testHex: null, cx: null, gain: null, mode: 'test' });
      toast('시험칠한 부분을 눌러 주세요');
      redraw();
    } catch (err) {
      alert('사진 저장 실패: ' + err.message);
    }
  };
  if (ph) {
    photoUrls([ph.path]).then((u) => { const im = $('#ftap-img'); if (im) im.src = u[ph.path]; });
    $$('#fmode button').forEach((x) => (x.onclick = () => { draft.mode = x.dataset.m; redraw(); }));
    $('#ftap').addEventListener('click', async (e) => {
      const img = $('#ftap-img');
      const r = img.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const s = sampleAt(await canvasFor(ph), x, y, draft.mode === 'card' ? 0.02 : 0.03);
      if (draft.mode === 'card') {
        Object.assign(draft, { cx: x, cy: y, gain: cardGain(s.hex), mode: 'test' });
        if (draft.raw) draft.testHex = applyGain(draft.raw, draft.gain);
      } else {
        Object.assign(draft, { x, y, raw: s.hex, testHex: applyGain(s.hex, draft.gain) });
      }
      redraw();
    });
  }
  $('#f-quick').onclick = () => quickFixSheet(dir.concat(draft.feelings));
  $('#f-calc').onclick = async () => {
    if (!draft.testHex && !draft.feelings.some((x) => x !== '맞음')) return alert('시험칠 사진을 찍어 시험칠 부분을 누르거나, "눈으로 보면?"에서 느낌을 골라 주세요.');
    const cur = findJob(jobId);
    const cb = cur.recipe.boards.find((x) => x.no === no);
    const result = solveFix({ target, testHex: draft.testHex, feelings: draft.feelings, stage: draft.stage, board: cb, pred: boardColors(cur, cb), ctx: solveCtx(cur), matMap: matMap() });
    const fix = { id: newId('fx'), at: new Date().toISOString(), boardNo: no, photoId: draft.photoId || null, testHex: draft.testHex || null, delta: de, dir, feelings: draft.feelings, stage: draft.stage, note: draft.note, result };
    ui.fix = null; // 저장 후 다시 그릴 때 새 입력칸으로
    await save('jobs', { ...findJob(jobId), fixes: [...(findJob(jobId).fixes || []), fix] });
    toast('보정 방법을 계산했습니다');
  };
  if ($('#f-ai')) $('#f-ai').onclick = async (e) => {
    const btn = e.currentTarget;
    busy(btn, true, 'AI가 비교하는 중…');
    try {
      const cur = findJob(jobId);
      const images = [];
      const mp = mainPhoto(cur);
      if (mp) images.push(await photoBase64(mp.path));
      if (ph) images.push(await photoBase64(ph.path));
      const res = await askAI({
        mode: 'fix', surface: cur.surface, board: b, target_hex: target, test_hex: draft.testHex,
        delta: de != null ? +de.toFixed(1) : null, direction: dir, feelings: draft.feelings, stage: draft.stage, note: draft.note, images,
        materials: ownedList().map((m) => ({ id: m.id, kind: m.kind, name: m.name, code: m.code, hex: m.hex })),
      });
      const fix = { id: newId('fx'), at: new Date().toISOString(), boardNo: no, photoId: draft.photoId || null, testHex: draft.testHex || null, delta: de, dir, feelings: draft.feelings, stage: draft.stage, note: draft.note, result: res.result };
      ui.fix = null;
      await save('jobs', { ...findJob(jobId), fixes: [...(findJob(jobId).fixes || []), fix] });
      toast('보정 방법을 받았습니다');
    } catch (err) {
      busy(btn, false);
      alert(err.message);
    }
  };
  $$('[data-apply]').forEach((x) => (x.onclick = () => applyFix(jobId, x.dataset.apply)));
  $$('[data-calib]').forEach((x) => (x.onclick = async () => {
    const cur = findJob(jobId);
    const f = cur.fixes.find((y) => y.id === x.dataset.calib);
    if (!confirm('이 시험칠로 잰 차이를 모든 판에 반영해 레시피를 다시 계산할까요? (판별로 고친 물감 비율은 새 계산으로 바뀝니다)')) return;
    busy(x, true, '다시 계산하는 중…');
    await calcRecipe(jobId, cur.recipe?.calcOpt || { grain: ['곧은결', '판 이음매'], gloss: '유광' }, f.result.k, (t) => (x.lastChild.textContent = t));
    toast('모든 판을 다시 계산했습니다');
    go('#job/' + jobId);
  }));
}

function dirIcon(d) {
  if (/밝게/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#8a6a4a,#e8d8bf)"></i>';
  if (/어둡게/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#e8d8bf,#5a3e28)"></i>';
  if (/붉게/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#b08a5a,#c0462c)"></i>';
  if (/붉은 기 줄/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#c0462c,#b08a5a)"></i>';
  if (/노랗게/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#a07a5a,#d6a43a)"></i>';
  if (/노란 기 줄/.test(d)) return '<i class="di" style="background:linear-gradient(90deg,#d6a43a,#a07a5a)"></i>';
  return '<i class="di" style="background:linear-gradient(90deg,#d07a2a,#8d7b68)"></i>';
}

function fixCard(j, f) {
  const r = f.result || {};
  const map = matMap();
  const target = pointHex(j, f.boardNo);
  return `<div class="card fix">
    <div class="row small muted">${r.source === 'calc' ? '계산' : 'AI'} · ${md(f.at.slice(0, 10))} · ${esc(f.stage)} 단계${f.delta != null ? ` · ΔE ${(+f.delta).toFixed(1)}` : ''}</div>
    ${f.testHex ? `<div class="compare sm">${swatch(target, '목표', '', 'tiny')}<span class="vs">vs</span>${swatch(f.testHex, '시험칠', '', 'tiny')}</div>` : ''}
    ${r.recovery ? '<div class="alert red" style="margin:8px 0">덧칠로는 안 됩니다 — 걷어내고 다시</div>' : ''}
    <p class="note">${esc(r.diagnosis || '')}</p>
    ${(r.actions || []).length ? `<ol class="acts">${r.actions.map((a) => { const m = map[a.paint_id]; return `<li>${m ? `${drops(m.hex, a.drops)} ` : ''}${esc(a.text)}</li>`; }).join('')}</ol>` : ''}
    <div class="btns">${(r.new_paints || []).length || (r.toner_main || []).length || r.toner_clear ? `<button class="btn sm accent" data-apply="${f.id}">레시피에 반영</button>` : ''}
    ${r.k && f.testHex && (j.recipe?.boards || []).length > 1 ? `<button class="btn sm line" data-calib="${f.id}">다른 판도 이 차이로 다시 계산</button>` : ''}</div>
    ${(r.tips || []).length ? `<ul class="bul">${r.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

async function applyFix(jobId, fixId) {
  const j = findJob(jobId);
  const f = j.fixes.find((x) => x.id === fixId);
  const r = f.result;
  const boards = j.recipe.boards.map((b) => {
    if (b.no !== f.boardNo) return b;
    const nb = { ...b };
    if ((r.new_paints || []).length) nb.base = { ...(b.base || {}), paints: r.new_paints };
    if ((r.toner_main || []).length || r.toner_clear) nb.toner = { ...(b.toner || {}), main: r.toner_main || [] };
    return nb;
  });
  await save('jobs', { ...j, recipe: { ...j.recipe, boards } });
  toast('레시피에 반영했습니다');
}

function quickFixSheet(dirs) {
  const rows = [
    { k: /붉게$|더 붉게/, t: '붉은 기 더하기', p: 'g-nr', d: 0.2, s: '나프톨레드 이쑤시개 끝' },
    { k: /붉은 기 줄/, t: '붉은 기 줄이기', p: 'g-ru', d: 0.5, s: '로우엄버 조금, 그래도 붉으면 프탈로그린 이쑤시개 끝' },
    { k: /노란 기 줄/, t: '노란 기 줄이기', p: 'g-nr', d: 0.2, s: '나프톨레드 살짝' },
    { k: /노랗게/, t: '노란 기 더하기', p: 'g-yo', d: 0.5, s: '옐로오커 반 방울' },
    { k: /채도|쨍함|회색/, t: '쨍한 느낌 죽이기', p: 'g-ru', d: 0.3, s: '로우엄버나 쉐이딩그레이 아주 조금' },
    { k: /밝게/, t: '밝게', p: 'g-tb', d: 1, s: '타이탄버프 추가 (화이트는 분필처럼 뿌예짐)' },
    { k: /어둡게/, t: '어둡게', p: 'g-bu', d: 0.3, s: '번트엄버 조금' },
  ];
  const map = matMap();
  const hit = rows.filter((r) => dirs.some((d) => r.k.test(d)));
  const show = hit.length ? hit : rows;
  openSheet(`${sheetHead('바탕 아크릴 보정 요령')}
    <p class="hint">바탕 단계에서 쓰는 요령입니다. 토너가 진해진 경우는 덧칠 대신 걷어내야 합니다.</p>
    <div class="list">${show.map((r) => `<div class="li"><i class="dot" style="background:${map[r.p].hex}"></i><div class="grow"><div class="t1">${esc(r.t)}</div><div class="small muted">${esc(r.s)}</div></div>${drops(map[r.p].hex, r.d)}</div>`).join('')}</div>`);
}

/* ================= 인쇄·PDF ================= */
function renderPrint(id) {
  const j = findJob(id);
  if (!j?.recipe) return (view.innerHTML = '<div class="empty">레시피가 없습니다</div>');
  const map = matMap();
  const R = j.recipe;
  const fin = map[R.finish?.id];
  view.innerHTML = `
    <div class="noprint row" style="padding:16px 0"><button class="btn ghost" data-go="#job/${id}">${ic('back')}돌아가기</button><button class="btn accent" id="pr">${ic('down')}인쇄 / PDF로 저장</button></div>
    <div class="print-page">
      <h1>${esc(jobTitle(j))}</h1>
      <p class="muted">${esc([j.surface, j.sub, ...(j.tags || [])].filter(Boolean).join(' · '))} · ${today()}</p>
      ${recipeTable(j)}
      <table class="rtable toner-t"><thead><tr><th>#</th><th>색</th><th>메인 토너</th><th>보정 토너</th><th>결</th></tr></thead><tbody>
        ${R.boards.map((b) => `<tr><td><span class="no">${b.no}</span></td><td><i class="dot" style="background:${esc(pointHex(j, b.no) || b.target_hex)}"></i>${esc(b.name || '')}</td>
          <td>${esc((b.toner?.main || []).map((t) => `${matName(map[t.id])}${t.passes > 1 ? ` ${t.passes}회` : ''}`).join(' → '))}</td>
          <td>${esc((b.toner?.adjust || []).map((t) => matName(map[t.id])).join(' → '))}</td>
          <td>${esc((b.grain || []).map((g) => GRAIN.find((x) => x.k === g.pattern)?.name).join(', '))}</td></tr>`).join('')}
      </tbody></table>
      <div class="print-cols">
        <div><h3>순서</h3><ol><li>아크릴 바탕: 조합 + 타이탄버프 20%, 한 톤 밝게, 퍼티 완전히 덮기</li><li>결 그리기: 결펜·세필, 덜 그리는 게 낫다</li><li>토너: 아크릴 완전히 마른 뒤, 얇게 1~2회</li><li>마감: ${esc(fin ? matName(fin) : '주변 광택에 맞춤')}</li></ol></div>
        <div><h3>토너 주의</h3><ul>${TONER_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
      </div>
    </div>`;
  $('#pr').onclick = () => window.print();
}

/* ================= 재료 ================= */
function renderMaterials() {
  const mats = allMaterials();
  const groups = ['paint', 'toner', 'clear', 'solid', 'pen', 'brush'];
  const ownedN = mats.filter(owned).length;
  view.innerHTML = `
    <div class="hd"><div class="grow"><p class="eyebrow">가진 것만 체크</p><h1>내 재료</h1></div><span class="sync">${ownedN}/${mats.length}</span></div>
    <p class="hint">체크한 재료만 레시피 계산에 씁니다. 없는 재료가 필요하면 '있으면 좋은 재료'로 알려 드립니다.</p>
    ${groups.map((k) => {
      const list = mats.filter((m) => m.kind === k);
      if (!list.length) return '';
      return `<div class="sec-title">${KIND_LABEL[k]}<span class="r">${list.filter(owned).length}/${list.length}</span></div>
      <div class="list">${list.map((m) => `
        <div class="li mat ${owned(m) ? '' : 'off'}">
          <i class="dot ${k === 'toner' || k === 'clear' || k === 'solid' ? 'sq' : ''}" style="background:${esc(m.hex)}"></i>
          <div class="grow"><div class="t1">${esc(matName(m))}</div><div class="t2">${esc([m.brand, m.role, m.gloss, m.note].filter(Boolean).join(' · '))}</div></div>
          ${k === 'pen' ? `<button class="btn sm ghost" data-pen="${m.id}">이름·색</button>` : `<label class="switch"><input type="checkbox" data-own="${m.id}" ${owned(m) ? 'checked' : ''} /><span></span></label>`}
        </div>`).join('')}</div>`;
    }).join('')}
    <p class="ref">색 견본은 제조사 색상표를 보고 잡은 대략 색입니다.</p>`;
  $$('[data-own]').forEach((c) => (c.onchange = () => {
    const miss = new Set(S().missing || []);
    if (c.checked) miss.delete(c.dataset.own);
    else miss.add(c.dataset.own);
    saveSettings({ ...S(), missing: [...miss] });
  }));
  $$('[data-pen]').forEach((b) => (b.onclick = () => {
    const p = S().pens.find((x) => x.id === b.dataset.pen);
    const sh = openSheet(`${sheetHead('결펜')}
      <label class="field"><span>이름 (예: 결펜 중간 갈색)</span><input id="p-name" value="${esc(p.name)}" /></label>
      <label class="field"><span>색 (결펜으로 그은 색과 비슷하게)</span><input id="p-hex" type="color" value="${esc(p.hex)}" style="height:56px" /></label>
      <div class="foot"><button class="btn block" id="p-save">저장</button></div>`);
    $('#p-save', sh).onclick = async () => {
      await saveSettings({ ...S(), pens: S().pens.map((x) => (x.id === p.id ? { ...x, name: $('#p-name', sh).value.trim() || x.name, hex: $('#p-hex', sh).value } : x)) });
      closeSheet();
    };
  }));
}

/* ================= 결 그리기 가이드 ================= */
function renderGrain() {
  const base = ui.guideBase;
  view.innerHTML = `
    <div class="hd"><div class="grow"><p class="eyebrow">바탕을 칠한 뒤</p><h1>결 그리기</h1></div></div>
    <div class="card row"><span class="grow small">바탕 색을 바꿔서 보기</span><input type="color" id="g-base" value="${esc(base)}" class="color-in" /></div>
    <div class="ggrid">${GRAIN.map((g) => `<button class="gcard big" data-guide="${g.k}">${grainSvg(g.k, base)}<b>${esc(g.name)}</b><small>${esc(g.look)}</small><span>${esc(g.tool)}</span></button>`).join('')}</div>
    <div class="card"><h3>공통 요령</h3><ul class="bul">${GRAIN_TIPS.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
    <div class="card"><h3>내 결 도구</h3><div class="pens">${(S().pens || []).map((p) => `<div class="pen"><i style="background:${esc(p.hex)}"></i><span>${esc(p.name)}</span></div>`).join('')}<div class="pen"><i style="background:#8a6a4a;border-radius:2px;width:6px"></i><span>세필붓</span></div></div>
      <p class="hint">결펜 이름·색은 <a href="#materials">내 재료</a>에서 바꿀 수 있습니다.</p></div>`;
  $('#g-base').oninput = (e) => { ui.guideBase = e.target.value; $$('.ggrid .gcard').forEach((c) => { const k = c.dataset.guide; c.querySelector('svg').outerHTML = grainSvg(k, ui.guideBase); }); };
  $$('[data-guide]').forEach((b) => (b.onclick = () => openGrainSheet(b.dataset.guide)));
}

function openGrainSheet(k, job) {
  const g = GRAIN.find((x) => x.k === k) || GRAIN[0];
  const base = job?.recipe ? boardColors(job, job.recipe.boards[0]).base || ui.guideBase : ui.guideBase;
  const pens = S().pens || [];
  openSheet(`${sheetHead(esc(g.name))}
    <div class="gbig">${grainSvg(g.k, base)}</div>
    <p class="muted small">${esc(g.look)}</p>
    <div class="row" style="margin:10px 0"><b class="small">도구</b><span class="tag">${esc(g.tool)}</span></div>
    <ol class="numsteps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="sec-title">내 결펜으로 그리면</div>
    <div class="pen-try">${pens.map((p) => `<div>${grainSvg(g.k, base, p.hex)}<small>${esc(p.name)}</small></div>`).join('')}</div>
    <p class="ref">그림은 예시입니다. 주변 판의 실제 결 간격·방향을 그대로 이어서 그리세요.</p>`);
}

/* ================= 설정 ================= */
function renderSettings() {
  const used = usedBytes();
  view.innerHTML = `
    <div class="hd sub"><button class="icon-btn" data-go="#jobs">${ic('back')}</button><h1 class="grow">설정</h1></div>
    <div class="card">
      <h3>계정</h3>
      <p class="small muted">${store.mode === 'cloud' ? esc(store.user?.email || '') : '이 기기에만 저장하는 모드 (AI 사용 불가)'}</p>
      ${store.mode === 'cloud' ? '<button class="btn line sm" id="s-out">로그아웃</button>' : ''}
    </div>
    <div class="card">
      <h3>AI 조언 (선택)</h3>
      <label class="check"><input type="checkbox" id="s-ai" ${S().aiEnabled ? 'checked' : ''} /> AI 버튼 보이기</label>
      <p class="hint">기본은 계산으로 레시피·보정을 합니다. 계산 결과가 마음에 들지 않을 때 설치안내 4단계(API 키·서버 함수)를 하고 켜세요.</p>
      ${S().aiEnabled ? `<label class="field"><span>한 달 최대 AI 분석 횟수</span><input id="s-limit" inputmode="numeric" value="${S().aiMonthlyLimit}" /></label>
      <p class="hint">레시피 1회 약 150~300원, 보정 1회 약 50~150원 정도 예상 (사진 수·답 길이에 따라 다름).</p>
      <button class="btn sm" id="s-limit-save">저장</button>` : ''}
    </div>
    <div class="card">
      <h3>백업·가져오기</h3>
      <p class="small muted">사진 ${(used / 1048576).toFixed(1)}MB 사용 중 · 백업 파일에는 사진이 들어가지 않습니다.</p>
      <div class="btns"><button class="btn line sm" id="s-export">${ic('down')}백업 받기</button>
      <label class="btn line sm">가져오기<input type="file" accept="application/json" id="s-import" hidden /></label></div>
    </div>`;
  const out = $('#s-out');
  if (out) out.onclick = () => confirm('로그아웃할까요?') && logout();
  $('#s-ai').onchange = (e) => saveSettings({ ...S(), aiEnabled: e.target.checked });
  if ($('#s-limit-save')) $('#s-limit-save').onclick = async () => { await saveSettings({ ...S(), aiMonthlyLimit: Math.max(1, parseInt($('#s-limit').value) || 100) }); toast('저장했습니다'); };
  $('#s-export').onclick = () => download(new Blob([JSON.stringify(store.state, null, 1)], { type: 'application/json' }), `복원조색_백업_${today()}.json`);
  $('#s-import').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const n = (d.jobs || []).length;
      if (!confirm(`조색 기록 ${n}개를 가져올까요? (같은 기록은 덮어씁니다)`)) return;
      await restoreAll({ jobs: d.jobs || [], ...(d.settings ? { settings: d.settings } : {}) });
      toast(`${n}개를 가져왔습니다`);
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    }
  };
}

/* ================= 시작 ================= */
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) go(g.dataset.go);
});
$$('#tabbar button').forEach((b) => (b.onclick = () => go('#' + b.dataset.tab)));
$('#fab').onclick = newJob;
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
initStore();
render();
