export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const num = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
export const won = (n) => num(n) + '원';
export const parseNum = (s) => Number(String(s ?? '').replace(/[^\d.-]/g, '')) || 0;
// 금액 칸: 입력하는 동안 1,000 단위 쉼표
export function moneyInput(el) {
  el.addEventListener('input', () => {
    const v = parseNum(el.value);
    el.value = v ? num(v) : '';
  });
}

const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const today = () => ymd(new Date());
export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return ymd(d);
}
export const toDate = (s) => new Date(s + 'T00:00:00');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const weekday = (s) => WD[toDate(s).getDay()];
// 10/25(토)
export function md(s) {
  if (!s) return '날짜 미정';
  const d = toDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}
export function fullDate(s) {
  if (!s) return '날짜 미정';
  const d = toDate(s);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
export function timeLabel(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? '오전' : '오후';
  const hh = h % 12 || 12;
  return `${ap} ${hh}시${m ? ' ' + m + '분' : ''}`;
}
export const monthKey = (s) => (s || '').slice(0, 7);
export function monthStart(s) {
  return s.slice(0, 8) + '01';
}
export function monthEnd(s) {
  const d = toDate(monthStart(s));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return ymd(d);
}
export function addMonths(s, n) {
  const d = toDate(monthStart(s));
  d.setMonth(d.getMonth() + n);
  return ymd(d);
}

/* ---------- 전화번호 ---------- */
export const digits = (s) => String(s || '').replace(/\D/g, '');
export function fmtPhone(s) {
  const d = digits(s);
  if (/^01\d{8,9}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return String(s || '').trim();
}

/* ---------- 한글 초성 검색 ---------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}
// 글자를 자모로 풀기: '문춘' → 'ㅁㅜㄴㅊㅜㄴ' (입력 중인 '문추'도 '문춘호'에 걸리도록)
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function jamo(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28] : ch;
  }
  return out;
}
const norm = (s) => String(s || '').toLowerCase().replace(/[\s·\-_/()]/g, '');
const isChoOnly = (s) => /^[ㄱ-ㅎ]+$/.test(s);
// 검색어 단어가 모두 들어 있으면 true — 이름 그대로, 입력 중인 글자, 초성(ㅁㅊㅎ) 모두 지원
export function matches(hayRaw, query) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm(hayRaw);
  const hayCho = chosung(hay);
  const hayJamo = jamo(hay);
  return words.every((w0) => {
    const w = norm(w0);
    return !w || hay.includes(w) || (isChoOnly(w) && hayCho.includes(w)) || hayJamo.includes(jamo(w));
  });
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const loaded = {};
export function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => {
        delete loaded[src];
        rej(new Error('인터넷 연결을 확인해 주세요'));
      };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}
