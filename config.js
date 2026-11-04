// Supabase 연결 설정 (두 사람이 함께 쓰는 클라우드). null 로 바꾸면 이 기기에만 저장하는 모드로 동작합니다.
// anon 키는 공개돼도 되는 키입니다. 데이터는 supabase-setup.sql의 보안 정책으로 두 분 계정만 볼 수 있습니다.
// 2026-11-04 새 서버(서울, 유료)로 이전. 공개 키(publishable)만 넣습니다.
// ⚠️ service_role 키는 절대 여기에 넣지 마세요.
export const supabaseConfig = {
  url: 'https://apboiejxoemmhsivqmdp.supabase.co',
  anonKey: 'sb_publishable_YaceMft-a0rHNV3gtqJ9Aw_cshUIILx',
};
