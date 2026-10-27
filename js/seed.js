// 기본 재료 목록과 고정 선택지. 제품 이름·대략 색만 넣고, 조색 비율(노하우)은 넣지 않습니다.
// hex는 제조사 색상표를 보고 잡은 대략 색 — 화면 견본용 참고값입니다.

// kind: paint(불투명 물감, 섞임) / toner(반투명, 겹침) / clear(투명 마감) / solid(불투명 스프레이) / pen(결펜) / brush(붓)
export const CATALOG = [
  // 골든 하이플로우 아크릴
  { id: 'g-tw', kind: 'paint', brand: '골든 하이플로우', name: '티타늄화이트', hex: '#f4f3ef', role: '불투명·밝기' },
  { id: 'g-tb', kind: 'paint', brand: '골든 하이플로우', name: '타이탄버프', hex: '#e2d3b6', role: '뼈대·밝기' },
  { id: 'g-rs', kind: 'paint', brand: '골든 하이플로우', name: '로우시에나', hex: '#b0702c', role: '뼈대·호박빛' },
  { id: 'g-yo', kind: 'paint', brand: '골든 하이플로우', name: '옐로오커', hex: '#c99a3e', role: '뼈대·노랑' },
  { id: 'g-yx', kind: 'paint', brand: '골든 하이플로우', name: '옐로옥시드', hex: '#c8902e', role: '노랑' },
  { id: 'g-nr', kind: 'paint', brand: '골든 하이플로우', name: '나프톨레드L', hex: '#d63a2c', role: '붉은 기' },
  { id: 'g-bu', kind: 'paint', brand: '골든 하이플로우', name: '번트엄버', hex: '#5c3b26', role: '뼈대·갈색·결' },
  { id: 'g-ru', kind: 'paint', brand: '골든 하이플로우', name: '로우엄버', hex: '#4f4334', role: '채도 낮춤' },
  { id: 'g-pg', kind: 'paint', brand: '골든 하이플로우', name: '프탈로그린', hex: '#0f5e4a', role: '강함·붉은 기 잡기', strong: true },
  { id: 'g-py', kind: 'paint', brand: '골든 하이플로우', name: '페인즈그레이', hex: '#3a4250', role: '강함·회색기', strong: true },
  { id: 'g-sg', kind: 'paint', brand: '골든 하이플로우', name: '쉐이딩그레이', hex: '#6b6e70', role: '강함·회색기', strong: true },
  { id: 'g-um', kind: 'paint', brand: '골든 하이플로우', name: '울트라마린', hex: '#2b3a9a', role: '강함·분홍기 잡기', strong: true },
  { id: 'g-cb', kind: 'paint', brand: '골든 하이플로우', name: '카본블랙', hex: '#1a1a1a', role: '강함·진한 결', strong: true },

  // 모호크 스프레이 (홈케어닥터 색상표)
  { id: 'm-0002', kind: 'toner', brand: '모호크', code: '0002', name: '내츄럴', hex: '#d2b48a' },
  { id: 'm-0321', kind: 'toner', brand: '모호크', code: '0321', name: '내츄럴오크', hex: '#dca44a' },
  { id: 'm-0322', kind: 'toner', brand: '모호크', code: '0322', name: '내츄럴진오크', hex: '#d79e3c' },
  { id: 'm-0415', kind: 'toner', brand: '모호크', code: '0415', name: '골든오크', hex: '#dca33a' },
  { id: 'm-0205', kind: 'toner', brand: '모호크', code: '0205', name: '중진월넛', hex: '#b8671e' },
  { id: 'm-0206', kind: 'toner', brand: '모호크', code: '0206', name: '진오크', hex: '#c27a2a' },
  { id: 'm-0207', kind: 'toner', brand: '모호크', code: '0207', name: '아메리칸월넛', hex: '#9a5a2c', note: '진함 — 결·가장 진한 판 마지막에만' },
  { id: 'm-0209', kind: 'toner', brand: '모호크', code: '0209', name: '진웬지', hex: '#1e1a18' },
  { id: 'm-0218', kind: 'toner', brand: '모호크', code: '0218', name: '중마호가니', hex: '#6e2422' },
  { id: 'm-0227', kind: 'toner', brand: '모호크', code: '0227', name: '진마호가니', hex: '#6a2a2a' },
  { id: 'm-0229', kind: 'toner', brand: '모호크', code: '0229', name: '브라운마호가니', hex: '#6b3222' },
  { id: 'm-0234', kind: 'toner', brand: '모호크', code: '0234', name: '일반월넛', hex: '#8e4e1e' },
  { id: 'm-0240', kind: 'toner', brand: '모호크', code: '0240', name: '일반오크', hex: '#b87a2a' },
  { id: 'm-0249', kind: 'toner', brand: '모호크', code: '0249', name: '퍼펙트브라운', hex: '#5e5530' },
  { id: 'm-0386', kind: 'toner', brand: '모호크', code: '0386', name: '붉은체리', hex: '#b5502e' },
  { id: 'm-0388', kind: 'toner', brand: '모호크', code: '0388', name: '연연월넛', hex: '#a9772e' },
  { id: 'm-0408', kind: 'toner', brand: '모호크', code: '0408', name: '일반체리', hex: '#9a4e22' },
  { id: 'm-7020', kind: 'toner', brand: '모호크', code: '7020', name: '중웬지', hex: '#6b5038' },
  { id: 'm-0420', kind: 'clear', brand: '모호크', code: '0420', name: '투명 유광', hex: '#f6f7f8', gloss: '유광 75~80%' },
  { id: 'm-0422', kind: 'clear', brand: '모호크', code: '0422', name: '투명 반광', hex: '#f3f4f5', gloss: '반광 30~35%' },
  { id: 'm-0421', kind: 'clear', brand: '모호크', code: '0421', name: '투명 하광', hex: '#eff0f1', gloss: '하광 10~15%' },
  { id: 'm-0485', kind: 'clear', brand: '모호크', code: '0485', name: '투명 무광', hex: '#ebeced', gloss: '무광 3~5%' },
  { id: 'm-0202', kind: 'solid', brand: '모호크', code: '0202', name: '백색', hex: '#f1eee6' },
  { id: 'm-0412', kind: 'solid', brand: '모호크', code: '0412', name: '아이보리', hex: '#ede6d3' },
  { id: 'm-0224', kind: 'solid', brand: '모호크', code: '0224', name: '검정색', hex: '#141414' },
  { id: 'm-metal', kind: 'solid', brand: '모호크', code: '메탈릭', name: '메탈릭 7종', hex: '#c9b27a' },

  // 도구
  { id: 't-brush', kind: 'brush', brand: '', name: '세필붓', hex: '#8a6a4a' },
];

// 2026-10-27 사장님 확인: 없는 재료 (나머지는 보유)
export const DEFAULT_MISSING = ['m-0202', 'm-0412', 'm-0205', 'm-0209', 'm-0229', 'm-0240', 'm-0388', 'm-0408', 'm-0422', 'm-0224', 'm-metal'];

export const KIND_LABEL = {
  paint: '아크릴 물감', toner: '토너 스프레이', clear: '투명 마감', solid: '단색 스프레이', pen: '결펜', brush: '붓',
};

export const SURFACES = [
  { k: '마루', sub: ['원목마루', '강마루', '강화마루', '합판마루'] },
  { k: '목재·몰딩·문', sub: ['문틀', '걸레받이', '몰딩', '문짝'] },
  { k: '천연 대리석', sub: ['상판', '바닥', '창대'] },
  { k: '인조대리석', sub: ['주방 상판', '세면대'] },
  { k: '타일·줄눈', sub: ['포세린', '도기질', '줄눈'] },
  { k: '도장면', sub: ['벽', '문 페인트'] },
];

export const GLOSS = ['유광', '반광', '하광', '무광'];

// 보정할 때 눈으로 본 느낌
export const FEELINGS = ['더 밝게', '더 어둡게', '더 노랗게', '더 붉게', '더 회색빛', '너무 쨍함', '맞음'];
export const STAGES = ['바탕', '결', '토너', '마감'];

// 결 무늬 종류 — 앱 안 예시 그림·안내 (써보면서 고치는 초기값)
export const GRAIN = [
  {
    k: 'straight', name: '곧은결', look: '길게 평행한 줄', tool: '결펜 (가는 것)',
    steps: ['주변 판의 줄 간격을 그대로 이어서', '한 번에 길게 말고 끊어서 긋기', '줄마다 굵기·진하기를 조금씩 다르게'],
  },
  {
    k: 'cathedral', name: '무늬결 (산 모양)', look: '겹겹이 아치·산봉우리', tool: '세필붓',
    steps: ['가장 안쪽 산부터 바깥으로', '붓을 세워 가늘게 시작해 눌러서 굵게', '바깥 줄일수록 연하게'],
  },
  {
    k: 'flame', name: '잔물결·불꽃', look: '결 사이 반짝이는 물결 (체리에 많음)', tool: '세필붓 (마른붓)',
    steps: ['물감을 거의 닦아낸 붓으로', '결 방향에 비스듬히 살짝 스치기', '마른 뒤 손가락으로 톡톡 번지게'],
  },
  {
    k: 'pores', name: '기공·도관', look: '짧은 점·짧은 선 (오크)', tool: '결펜 끝 / 세필 끝',
    steps: ['결 방향으로 짧게 콕콕', '간격은 불규칙하게 — 규칙적이면 가짜 티'],
  },
  {
    k: 'knot', name: '옹이', look: '진한 타원 + 휘어 감는 결', tool: '세필붓',
    steps: ['진한 가운데 먼저', '주변 결을 옹이 둘레로 휘어지게 이어 그리기'],
  },
  {
    k: 'seam', name: '판 이음매', look: '판 사이 곧은 선', tool: '결펜 (가장 진한 것) + 자',
    steps: ['칼끝이나 자를 대고 한 번에', '주변 이음매보다 굵어지지 않게'],
  },
  {
    k: 'tone', name: '색 얼룩·명암', look: '한 판 안 진한 곳·밝은 곳', tool: '세필붓 넓게 / 토너',
    steps: ['결보다 먼저, 묽은 색으로 넓게', '대부분은 토너 단계에서 맞춤'],
  },
];

export const GRAIN_TIPS = [
  '결 색은 바탕보다 1~2톤 진하게 (번트엄버 위주, 아주 진한 결에만 카본블랙 한 방울)',
  '결은 덜 그리는 게 낫다 — 너무 많고 선명하면 가짜처럼 보임',
  '서서 내려다봐서 주변과 비슷하면 멈춤',
  '결이 완전히 마른 뒤 토너. 토너가 결을 한 톤 부드럽게 눌러 줌',
];

export const TONER_TIPS = [
  '30~40cm 거리에서 미스트처럼 얇게',
  '한 번 뿌릴 때마다 말리고 확인',
  '판 이음새는 마스킹테이프, 주변은 구멍 낸 종이로 가리기',
  '작은 부위는 뚜껑에 뿌려 세필붓으로 바르기',
  '아크릴이 완전히 마른 뒤 (가능하면 하루)',
  '진해지면 밝은 토너로 못 덮음 — 걷어내고 다시',
];

export const RECOVERY = [
  { when: '토너가 너무 진함', what: '밝은 토너로 덮어도 안 밝아집니다. 걷어내고 다시 합니다.' },
  { when: '주변 판까지 번짐', what: '기존 코팅 위라면 래커신너 묻힌 천으로 닦기. 구석에서 먼저 시험.' },
  { when: '보수 부위 자체', what: '칼날로 긁거나 320~400방 사포로 퍼티 면까지.' },
  { when: '토너가 쭈글쭈글', what: '아크릴이 덜 말랐거나 토너가 두꺼움. 말린 뒤 샌딩, 얇게 다시.' },
  { when: '퍼티 색이 비침', what: '불투명 바탕을 얇게 2~3회. 첫 코트는 화이트+옐로오커.' },
];

export const DEFAULT_SETTINGS = {
  missing: DEFAULT_MISSING, // 없는 재료 id
  pens: [
    { id: 'pen1', name: '결펜 ①', hex: '#8a5a2b' },
    { id: 'pen2', name: '결펜 ②', hex: '#5e3a20' },
    { id: 'pen3', name: '결펜 ③', hex: '#3a2416' },
  ],
  custom: [], // 사장님이 추가한 재료
  aiEnabled: false, // AI는 선택 (설치안내 4단계 후 설정에서 켬)
  aiMonthlyLimit: 100, // 월 AI 분석 횟수 상한
};

// 광택(투명 마감) 맞추기 요령 — 써보면서 고치는 초기값
export const GLOSS_TIPS = [
  '마지막에 뿌린 마감이 광택을 정합니다. 주변보다 번들거리면 하광을, 죽어 보이면 유광을 얇게 한 번 더',
  '애매하면 한 단계 낮은 쪽(하광)부터 — 올리는 건 쉽고, 비교도 쉬움',
  '반광(0422)이 없을 때: 하광으로 마감 → 말린 뒤 비교 → 죽어 보이면 유광을 멀리서 아주 얇게 한 번',
  '광택 비교는 완전히 마른 뒤에. 젖어 있을 땐 실제보다 번들거림',
  '비교할 땐 낮게 쪼그려 앉아 조명이 보수 부위와 주변 판에 같이 비치게 보기',
  '30cm쯤 떨어져 얇게 2~3번. 한 번에 두껍게 뿌리면 흘러내리고 광택이 들뜸',
  '판 이음매에서 끊기 (마스킹테이프) — 광택 차이가 판 중간에서 끊기면 더 티 남',
  '습한 날엔 하얗게 뿌옇게 될 수 있음. 마른 날에, 생기면 완전히 말린 뒤 얇게 다시',
  '주변 판이 더럽거나 왁스가 남아 있으면 광택이 달라 보임 — 닦고 나서 비교',
];
