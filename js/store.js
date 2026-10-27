// 데이터 저장소: config.js에 Supabase 설정이 있으면 두 사람이 함께 쓰는 클라우드,
// 없으면(또는 주소 끝에 ?local) 이 기기 안(localStorage)에만 저장합니다.
// 견적 앱과 같은 Supabase 프로젝트를 쓰지만, 표는 color_docs 로 따로 둡니다.
// 마지막 데이터를 휴대폰에 보관해 두어 신호가 약한 현장에서도 열리고,
// 보내지 못한 변경은 인터넷이 다시 연결되면 자동으로 올립니다.
import { supabaseConfig } from '../config.js';
import { DEFAULT_SETTINGS } from './seed.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
const LS_KEY = 'joseak-data-v1';
const CACHE_KEY = 'joseak-cloud-cache-v1';
const OUTBOX_KEY = 'joseak-outbox-v1';
const TABLE = 'color_docs'; // (col, id, data) 한 표에 조색 작업·설정을 저장
export const BUCKET = 'color-photos';

const forceLocal = /[?&]local\b/.test(location.search);
const listeners = new Set();
let sb = null;
let channel = null;

export const COLS = ['jobs'];

export const store = {
  mode: supabaseConfig && !forceLocal ? 'cloud' : 'local',
  user: null,
  ready: false,
  online: true,
  pending: 0,
  state: { jobs: [], settings: { ...DEFAULT_SETTINGS } },
};
export const supabase = () => sb;

function emit() {
  listeners.forEach((fn) => fn(store));
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const clean = (o) => JSON.parse(JSON.stringify(o)); // undefined 값 제거

function readJSON(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch (_) {
    return fallback;
  }
}
function writeJSON(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) {
    alert('기기 저장 공간이 부족해 저장하지 못했습니다.');
  }
}

function withDefaults(s) {
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

/* ---------- 메모리 상태 변경 (두 모드 공통) ---------- */
function applyPut(col, obj) {
  if (col === 'settings') {
    store.state.settings = withDefaults(obj);
    return;
  }
  if (!COLS.includes(col)) return;
  const list = store.state[col];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj;
  else list.push(obj);
}
function applyDel(col, id) {
  if (COLS.includes(col)) store.state[col] = store.state[col].filter((x) => x.id !== id);
}
function persist() {
  writeJSON(store.mode === 'local' ? LS_KEY : CACHE_KEY, store.state);
}
function loadState(d) {
  store.state = {
    jobs: d.jobs || [],
    settings: withDefaults(d.settings),
  };
}

/* ---------- 클라우드(Supabase) ---------- */
const rowToObj = (r) => (r.col === 'settings' ? r.data : { ...r.data, id: r.id });

async function fetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(TABLE).select('col,id,data').range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const st = { jobs: [], settings: withDefaults() };
  rows.forEach((r) => {
    if (r.col === 'settings') st.settings = withDefaults(r.data);
    else if (COLS.includes(r.col)) st[r.col].push(rowToObj(r));
  });
  store.state = st;
  // 아직 못 올린 변경은 화면에 계속 보이도록 다시 적용
  readJSON(OUTBOX_KEY, []).forEach((op) => (op.t === 'put' ? applyPut(op.col, op.obj) : applyDel(op.col, op.id)));
  persist();
}

function startRealtime() {
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel('color-docs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (p) => {
      if (p.eventType === 'DELETE') applyDel(p.old.col, p.old.id);
      else applyPut(p.new.col, rowToObj(p.new));
      persist();
      emit();
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && store.ready) refresh();
    });
}

async function refresh() {
  try {
    await flushOutbox();
    await fetchAll();
    store.online = true;
  } catch (e) {
    store.online = false;
    console.warn('클라우드 연결 실패, 저장된 데이터로 표시합니다', e);
  }
  store.ready = true;
  emit();
}

async function onSignedIn(user) {
  store.user = user;
  const cached = readJSON(CACHE_KEY, null);
  if (cached) {
    loadState(cached);
    store.ready = true;
    emit();
  }
  await refresh();
  startRealtime();
}

async function initCloud() {
  const { createClient } = await import(SUPABASE_JS);
  sb = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  store.pending = readJSON(OUTBOX_KEY, []).length;
  const { data } = await sb.auth.getSession();
  if (data.session) await onSignedIn(data.session.user);
  else {
    store.ready = true;
    emit();
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !store.user) onSignedIn(session.user);
    if (event === 'SIGNED_OUT') {
      store.user = null;
      if (channel) sb.removeChannel(channel);
      channel = null;
      localStorage.removeItem(CACHE_KEY);
      emit();
    }
  });
  window.addEventListener('online', () => store.user && refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.user) refresh();
  });
}

/* ---------- 보내지 못한 변경 모아두기 ---------- */
function queue(op) {
  const box = readJSON(OUTBOX_KEY, []);
  box.push(op);
  writeJSON(OUTBOX_KEY, box);
  store.pending = box.length;
}
async function sendOp(op) {
  if (op.t === 'put') {
    const { id, ...rest } = op.obj;
    const { error } = await sb.from(TABLE).upsert({
      col: op.col, id: op.col === 'settings' ? 'main' : id, data: clean(op.col === 'settings' ? op.obj : rest),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } else {
    const { error } = await sb.from(TABLE).delete().match({ col: op.col, id: op.id });
    if (error) throw error;
  }
}
let flushing = null;
function flushOutbox() {
  if (flushing) return flushing;
  flushing = (async () => {
    let box = readJSON(OUTBOX_KEY, []);
    while (box.length) {
      await sendOp(box[0]); // 실패하면 남겨 두고 중단
      box = readJSON(OUTBOX_KEY, []).slice(1);
      writeJSON(OUTBOX_KEY, box);
      store.pending = box.length;
    }
  })().finally(() => (flushing = null));
  return flushing;
}

async function write(op) {
  if (op.t === 'put') applyPut(op.col, op.obj);
  else applyDel(op.col, op.id);
  persist();
  emit();
  if (store.mode === 'cloud') {
    queue(op);
    try {
      await flushOutbox();
      store.online = true;
    } catch (e) {
      store.online = false;
      console.warn('나중에 다시 올립니다', e);
    }
    emit();
  }
}

/* ---------- 공개 함수 ---------- */
export async function initStore() {
  if (store.mode === 'local') {
    const d = readJSON(LS_KEY, null);
    if (d) loadState(d);
    else persist();
    store.ready = true;
    emit();
  } else {
    await initCloud();
  }
}

export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function logout() {
  await sb.auth.signOut();
}

const stamp = (o) => ({ ...o, updatedAt: new Date().toISOString(), createdAt: o.createdAt || new Date().toISOString() });
export const save = (col, obj) => write({ t: 'put', col, obj: stamp(obj) });
export const remove = (col, id) => write({ t: 'del', col, id });
export const saveSettings = (s) => write({ t: 'put', col: 'settings', obj: s });

// 백업 복원: 전체 데이터를 통째로 올리기
export async function restoreAll(data) {
  const ops = [];
  COLS.forEach((c) => (data[c] || []).forEach((o) => ops.push({ t: 'put', col: c, obj: o })));
  if (data.settings) ops.push({ t: 'put', col: 'settings', obj: data.settings });
  ops.forEach((op) => applyPut(op.col, op.obj));
  persist();
  if (store.mode === 'cloud') {
    const now = new Date().toISOString();
    const rows = ops.map((op) => {
      const { id, ...rest } = op.obj;
      return { col: op.col, id: op.col === 'settings' ? 'main' : id, data: clean(op.col === 'settings' ? op.obj : rest), updated_at: now };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from(TABLE).upsert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  }
  emit();
}

export function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
