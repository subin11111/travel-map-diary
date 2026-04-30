# Travel Map Diary

서울 행정동 단위로 방문 기록, 일기, 사진을 저장하는 개인 여행 지도 웹앱입니다.

## 주요 기능

- 네이버 지도 위에 서울 행정동 경계 표시
- 동 단위 hover 안내와 선택 상태 표시
- 선택한 동에 방문 일기와 사진 저장
- 방문한 동 개수, 총 방문 횟수, 가장 많이 간 동 통계 제공
- 계정별 방문 기록과 일기 타임라인 분리
- 아이디/비밀번호 기반 회원가입 및 로그인
- 계정 정보 확인과 비밀번호 변경

## 기술 스택

- Next.js 16.2.4
- React 19.2.4
- TypeScript
- Tailwind CSS 4
- Supabase Auth / Database / Storage
- Naver Maps JavaScript API

## 페이지 구조

| Route | 설명 |
| --- | --- |
| `/` | 지도 홈, 동 선택, 방문 통계, 일기 타임라인 |
| `/login` | 아이디/비밀번호 로그인 |
| `/signup` | 아이디/비밀번호 회원가입 |
| `/profile` | 계정 정보 및 비밀번호 변경 |

## 주요 컴포넌트

- `components/NaverMap.tsx`
  - 메인 지도 UI
  - 서울 행정동 polygon 렌더링
  - hover/선택 안내
  - 방문 기록 및 일기 저장
- `components/AuthForm.tsx`
  - 로그인/회원가입 공용 폼
  - 회원가입 후 자동 로그인 방지
  - 기존 `아이디@gmail.com` 계정 로그인 fallback 지원
- `components/AppMenu.tsx`
  - 좌상단 메뉴
  - 로그인 상태 표시
  - 지도 홈, 정보수정, 로그인/회원가입 이동
  - 로그아웃 기능
- `lib/auth.ts`
  - 사용자가 입력한 아이디를 Supabase Auth용 내부 이메일로 변환
  - 현재 내부 계정 도메인: `users.travel-map-diary.local`
- `lib/supabase.ts`
  - Supabase 클라이언트 생성

## Supabase 사용 목적

- Supabase Auth: 사용자 회원가입, 로그인, 로그아웃, 비밀번호 변경
- Supabase Database: 사용자별 방문 동, 방문 횟수, 동별 일기 저장
- Supabase Storage: 동별 일기에 첨부한 사진 저장
- Row Level Security: 사용자별 방문 기록, 일기, 사진 데이터 분리

## 환경 변수

프로젝트 루트에 `.env.local` 파일을 만들고 아래 값을 설정합니다.

```env
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your_naver_map_client_id
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 로컬 실행

의존성을 설치합니다.

```bash
npm install
```

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 아래 주소로 접속합니다.

```text
http://localhost:3000
```

## 현재 검증 상태

- `npm.cmd run lint` 통과
- 현재 새 파일과 변경 파일은 아직 커밋되지 않은 상태입니다.

## 최근 개선 사항

- 회원가입 후 자동 로그인 흐름 방지
- 기존 `아이디@gmail.com` 계정도 로그인 시 fallback으로 지원
- 일반 사용자에게 불필요한 개발자용 안내 문구 제거
- 지도 hover 안내와 상태 메시지 겹침 해결
- 내부 계정 도메인을 `users.travel-map-diary.local`로 변경

## 향후 개선 가능 항목

- README에 실제 화면 스크린샷 추가
- 방문 기록 수정/삭제 기능 추가
- 일기 사진 업로드 정책과 오류 메시지 보강
- Supabase 마이그레이션 정리 및 배포 절차 문서화
- 모바일 지도 조작과 타임라인 UI 개선
