// AI 조언 요청: Supabase 서버 함수(color-advisor)를 부릅니다. API 키는 서버에만 있습니다.
// 이 기기 모드(?local)에서는 서버를 쓸 수 없으므로 안내만 띄웁니다.
import { store, supabase } from './store.js';

export const aiReady = () => store.mode === 'cloud' && !!store.user;

export async function askAI(body) {
  if (!aiReady()) throw new Error('AI 조언은 로그인한 클라우드 모드에서만 됩니다. (설치안내.md 참고)');
  const { data, error } = await supabase().functions.invoke('color-advisor', {
    body: { ...body, limit: store.state.settings.aiMonthlyLimit },
  });
  if (error) {
    let msg = error.message;
    try {
      const j = await error.context.json();
      if (j?.error) msg = j.error;
    } catch (_) {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
