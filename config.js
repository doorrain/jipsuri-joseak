// Supabase 연결 설정 (두 사람이 함께 쓰는 클라우드). null 로 바꾸면 이 기기에만 저장하는 모드로 동작합니다.
// anon 키는 공개돼도 되는 키입니다. 데이터는 supabase-setup.sql의 보안 정책으로 두 분 계정만 볼 수 있습니다.
// ⚠️ service_role 키는 절대 여기에 넣지 마세요.
export const supabaseConfig = {
  url: 'https://ljipnmpkwdrerobsiqmg.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaXBubXBrd2RyZXJvYnNpcW1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NDMyMDgsImV4cCI6MjEwODAxOTIwOH0.oK9EwdlgjHVh_B1V30TD5fLO8wsk1H0Hr4AndKeploE',
};
