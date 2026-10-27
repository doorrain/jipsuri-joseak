// 조색 사진: 올리기 전에 줄여서(긴 변 1600px) 저장하고, 목록에는 작은 미리보기(긴 변 360px)만 띄웁니다.
// 클라우드 모드 → Supabase Storage(비공개 보관함), 이 기기 모드 → IndexedDB.
import { store, supabase, BUCKET, newId } from './store.js';

const FULL = 1600;
const THUMB = 360;

/* ---------- 이 기기 보관(IndexedDB) ---------- */
let dbp = null;
function idb() {
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('joseak-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbp;
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('p', mode);
    const req = fn(tx.objectStore('p'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}

/* ---------- 줄이기 ---------- */
async function bitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
}
async function resize(src, max, quality) {
  const k = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return { blob, w, h };
}

async function put(path, blob) {
  if (store.mode === 'cloud') {
    const { error } = await supabase().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  } else {
    await idbDo('readwrite', (s) => s.put(blob, path));
  }
}

// 사진 한 장을 줄여서 올리고 사진 정보를 돌려줌. crop: {x,y,w,h} 비율(0~1)이면 그 부분만
export async function uploadPhoto(jobId, file, stage, crop) {
  let src = await bitmap(file);
  if (crop) {
    const c = document.createElement('canvas');
    c.width = Math.round(src.width * crop.w);
    c.height = Math.round(src.height * crop.h);
    c.getContext('2d').drawImage(src, -Math.round(src.width * crop.x), -Math.round(src.height * crop.y));
    src = c;
  }
  const id = newId('ph');
  const full = await resize(src, FULL, 0.85);
  const th = await resize(src, THUMB, 0.7);
  const path = `${jobId}/${id}.jpg`;
  const thumb = `${jobId}/${id}_t.jpg`;
  await put(path, full.blob);
  await put(thumb, th.blob);
  return { id, path, thumb, stage, w: full.w, h: full.h, size: full.blob.size + th.blob.size, at: new Date().toISOString() };
}

export async function deletePhotos(photos) {
  const paths = photos.flatMap((p) => [p.path, p.thumb]);
  if (!paths.length) return;
  if (store.mode === 'cloud') {
    const { error } = await supabase().storage.from(BUCKET).remove(paths);
    if (error) throw error;
  } else {
    await idbDo('readwrite', (s) => paths.forEach((p) => s.delete(p)));
  }
}

/* ---------- 보기 ---------- */
const urlCache = new Map(); // path → { url, exp }
export async function photoUrls(paths) {
  const now = Date.now();
  const need = paths.filter((p) => p && !(urlCache.get(p)?.exp > now));
  if (need.length) {
    if (store.mode === 'cloud') {
      const { data, error } = await supabase().storage.from(BUCKET).createSignedUrls(need, 3600);
      if (error) throw error;
      data.forEach((d) => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, exp: now + 50 * 60 * 1000 }));
    } else {
      for (const p of need) {
        const b = await idbDo('readonly', (s) => s.get(p));
        if (b) urlCache.set(p, { url: URL.createObjectURL(b), exp: Infinity });
      }
    }
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url || '']));
}

export async function getBlob(path) {
  if (store.mode === 'cloud') {
    const { data, error } = await supabase().storage.from(BUCKET).download(path);
    if (error) throw error;
    return data;
  }
  return idbDo('readonly', (s) => s.get(path));
}

// AI에 보낼 base64 (사진 원본 저장본)
export async function photoBase64(path) {
  const b = await getBlob(path);
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// 화면에 그릴 캔버스 (색 뽑기용)
export async function photoCanvas(path) {
  const src = await bitmap(await getBlob(path));
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export function usedBytes() {
  return store.state.jobs.reduce((s, j) => s + (j.photos || []).reduce((a, p) => a + (p.size || 0), 0), 0);
}
