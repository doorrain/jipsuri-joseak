// 비상 복구 화면 (2026-11 서버 이전): 이 기기에 남은 예전 데이터를 새 서버로 올리거나 파일로 받기.
// 로그인 전에는 '파일로 받기'만, 로그인 후에는 '새 서버로 올리기'도 보여 줍니다.
import { store, subscribe, rescueCopy, rescueCounts, uploadRescue, dismissRescue } from './store.js';

const APP = '조색앱';
const LABEL = { jobs: '조색 기록' };
const summary = (r) => rescueCounts(r).filter(([, n]) => n).map(([k, n]) => `${LABEL[k] || k} ${n}건`).join(', ');

function download(r) {
  const blob = new Blob([JSON.stringify({ app: APP, at: new Date().toISOString(), rescue: true, ...r.data, outbox: r.outbox }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${APP}_비상백업_${new Date().toISOString().slice(0, 10)}_${/Mobile/.test(navigator.userAgent) ? '휴대폰' : 'PC'}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function draw() {
  let el = document.getElementById('rescue-bar');
  const r = store.mode === 'cloud' && store.ready ? rescueCopy() : null;
  if (!r) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'rescue-bar';
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:200;width:calc(100% - 24px);max-width:520px;background:#1b2433;color:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 10px 30px rgba(0,0,0,.3);font-size:14px;line-height:1.5';
    document.body.append(el);
  }
  const btn = 'border:0;border-radius:10px;padding:10px 12px;font-weight:700;font-size:14px;cursor:pointer';
  el.innerHTML = `<b>이 기기에 예전 데이터가 남아 있어요</b><div style="opacity:.8;margin:2px 0 10px">${summary(r)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${store.user ? `<button id="rb-up" style="${btn};background:#d9772b;color:#fff">새 서버로 올리기</button>` : '<span style="opacity:.8;align-self:center;margin-right:auto">로그인하면 새 서버로 올릴 수 있어요</span>'}
      <button id="rb-dl" style="${btn};background:rgba(255,255,255,.14);color:#fff">파일로 받기</button>
      ${store.user ? `<button id="rb-no" style="${btn};background:transparent;color:#fff;opacity:.7">닫기</button>` : ''}
    </div>`;
  el.querySelector('#rb-dl').onclick = () => download(r);
  const up = el.querySelector('#rb-up');
  if (up) up.onclick = async () => {
    up.disabled = true;
    up.textContent = '올리는 중…';
    try {
      const n = await uploadRescue();
      alert(`새 서버로 ${n}건을 올렸어요. 이미 다른 기기에서 올린 것은 그대로 두었어요.`);
    } catch (e) {
      console.error(e);
      alert('올리지 못했어요. 인터넷을 확인하고 다시 눌러 주세요. 먼저 [파일로 받기]로 사본을 받아 두면 안전해요.');
      up.disabled = false;
      up.textContent = '새 서버로 올리기';
    }
    draw();
  };
  const no = el.querySelector('#rb-no');
  if (no) no.onclick = () => {
    if (!confirm('이 기기의 예전 데이터를 올리지 않고 닫을까요?\n(다른 휴대폰에서 이미 올렸다면 닫아도 돼요)')) return;
    dismissRescue();
    draw();
  };
}
subscribe(draw);
