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

## Supabase 마이그레이션

다중 지도와 공유 지도 기능은 아래 테이블을 필요로 합니다.

- `public.maps`
- `public.map_members`
- `public.user_profiles`
- 기존 기록 테이블의 `map_id`
  - 현재 프로젝트: `public.visited_places`, `public.dong_diaries`

Supabase SQL Editor에서 다음 마이그레이션을 먼저 실행하세요.

```text
supabase/migrations/20260430_add_multi_maps_and_sharing.sql
```

SQL 적용 후에도 `Could not find the table 'public.map_members' in the schema cache` 오류가 계속 보이면 다음을 확인하세요.

- Supabase Dashboard 새로고침
- API schema cache reload
- 로컬 dev server 재시작
- `.next` 캐시 삭제 후 재실행

확인 순서:

1. Supabase SQL Editor에서 migration SQL 실행
2. `maps`, `map_members` 테이블 생성 확인
3. 앱 dev server 재시작
4. 신규 로그인 계정으로 접속해 기본 지도 자동 생성 확인
5. 기존 계정으로 접속해 지도 목록 확인
6. 공유 받은 지도 목록 조회 확인
7. `npm.cmd run lint` 실행

지도 생성 실패 시 Supabase에서 확인할 항목:

- `public.maps` 테이블 존재 여부
- `public.map_members` 테이블 존재 여부
- `public.create_travel_map` RPC 함수 존재 여부
- `maps` insert RLS policy 존재 여부
- `map_members` insert RLS policy 또는 `security definer` RPC 설정 여부
- SQL 적용 후 schema cache reload 여부

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
- `npx.cmd tsc --noEmit` 통과
- `npm.cmd run build` 통과
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

## 배포 방법

### 1. Vercel 배포 순서

1. GitHub 저장소를 Vercel에 Import합니다.
2. Framework Preset은 `Next.js`로 둡니다.
3. Root Directory는 프로젝트 루트(`travel-map-diary`)로 설정합니다.
4. Install Command는 기본값 `npm install`, Build Command는 `npm run build`, Output Directory는 비워 둡니다.
5. 아래 환경 변수를 Vercel Project Settings > Environment Variables에 등록한 뒤 Production/Preview 배포를 실행합니다.

### 2. Vercel 환경 변수

`.env.local`에서 사용하는 모든 public 환경 변수는 Vercel에도 같은 이름으로 등록해야 합니다.

```env
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your_naver_map_client_id
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key만 사용합니다.
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`: Naver Maps JavaScript API Client ID 또는 ncpKeyId

보안 주의:

- Supabase service role key는 클라이언트 코드와 `NEXT_PUBLIC_*` 환경 변수에 절대 넣지 않습니다.
- 브라우저에서 사용하는 키는 Supabase anon key만 허용합니다.
- 데이터 접근 권한은 Supabase Storage/RLS 정책으로 제어합니다.

### 3. Supabase Auth URL 설정

Supabase Dashboard > Authentication > URL Configuration에서 배포 도메인을 등록합니다.

- Site URL: `https://배포도메인.vercel.app`
- Redirect URLs:
  - `https://배포도메인.vercel.app`
  - `https://배포도메인.vercel.app/login`
  - `https://배포도메인.vercel.app/signup`
  - `https://배포도메인.vercel.app/profile`

회원가입 이메일 확인 링크는 현재 접속한 origin 기준 `/login`으로 돌아가도록 설정되어 있으므로, Preview 배포를 테스트할 때는 해당 Preview URL도 Redirect URLs에 추가하세요.

### 4. Naver Maps 인증 도메인 설정

Naver Cloud Platform > Maps > Application 인증 정보의 Web 서비스 URL에 아래 도메인을 등록합니다.

- 로컬 개발용: `http://localhost:3000`
- 배포용: `https://배포도메인.vercel.app`

Preview 배포 URL에서 지도까지 확인하려면 해당 Preview URL도 인증 도메인에 임시로 추가합니다.

### 5. 배포 전 점검 체크리스트

- `npm.cmd run lint` 통과
- `npm run build` 통과
- 코드에 `localhost`, `127.0.0.1`, 고정 absolute app URL이 하드코딩되어 있지 않은지 확인
- Vercel에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` 등록
- Supabase Auth Site URL과 Redirect URLs에 배포 URL 등록
- Naver Maps 인증 도메인에 배포 URL 등록
- Supabase 마이그레이션과 RLS/Storage 정책 적용 확인

### 6. 배포 후 테스트 체크리스트

- 홈 접속
- 네이버 지도 로딩
- 로그인
- 회원가입
- 로그아웃
- 지도 생성
- 지도 선택
- 지도 공유
- 일기 저장
- 사진 업로드 및 표시
- 새로고침 후 세션 유지
## Supabase CLI migration 관리

데이터베이스 스키마는 `supabase/migrations`의 SQL migration으로 관리합니다. VSCode에서 SQL 파일을 작성하는 것만으로는 원격 Supabase DB에 반영되지 않으므로, 링크된 프로젝트에 migration을 push해야 합니다.

현재 project ref는 `kpibshapazejhkgblrmb`입니다.

```bash
npx supabase login
npm run db:link
npm run db:status
npm run db:push
```

추가된 migration 파일:

- `20260430010100_create_maps_table.sql`: `maps` 테이블과 `updated_at` 트리거 생성
- `20260430010200_create_map_members_table.sql`: `user_profiles`, `map_members` 테이블 생성
- `20260430010300_add_map_id_to_existing_tables.sql`: 기존 기록 테이블에 `map_id` 추가 및 기본 지도 연결
- `20260430010400_enable_rls_and_policies.sql`: RLS, 정책, helper function, 지도 생성 RPC 정리

자세한 사용 순서는 [supabase/README.md](./supabase/README.md)를 참고하세요.

## 지도 데이터 파일 정책

전국 읍면동 원본 CSV, UTF-8 전처리 CSV, 변환 중간 산출물은 용량이 크기 때문에 Git에 포함하지 않습니다. 필요한 원본 데이터는 별도로 다운로드한 뒤 로컬에서 변환 스크립트로 다시 생성합니다.

- 원본 CSV: Git 제외
- 전처리 CSV: Git 제외
- `public/data/*.geojson`: 대용량 전국 GeoJSON 산출물은 Git 제외
- 앱에 포함해야 하는 작은 샘플/기본 경계 데이터만 별도로 검토 후 커밋

데이터를 다시 만들 때는 `tmd_preprocess` 또는 `scripts`의 변환 스크립트를 사용해 로컬에서 CSV를 전처리하고 GeoJSON을 생성하세요.

## 전국 읍면동 벡터 타일

전국 읍면동 경계는 런타임에서 대용량 GeoJSON을 직접 fetch하지 않고 PMTiles 벡터 타일로 로드합니다.

```bash
python tmd_preprocess/convert_to_geojson.py --input "data/raw/국토교통부 국토지리정보원_공간정보공동활용_읍면동_20230915.csv" --output public/geo/eupmyeondong.geojson --source-crs EPSG:4326
npm run tiles:build
```

`npm run tiles:build`는 `tippecanoe` CLI가 필요합니다. Windows에서는 WSL, Docker, macOS/Linux 환경에서 `tippecanoe`를 설치한 뒤 실행하세요. 출력 파일은 `public/tiles/eupmyeondong.pmtiles`이며, 앱은 이 파일을 `MapLibre GL JS`와 `pmtiles` 프로토콜로 로드합니다.

- 런타임 경계 파일: `public/tiles/eupmyeondong.pmtiles`
- source id: `eupmyeondong-boundaries`
- source layer: `eupmyeondong`
- properties: `emd_code`, `emd_name`
- 색상 규칙: 방문 전 회색, 방문 있음 초록, 통계 상위 동 주황, 선택된 동 하늘색

원본 CSV와 중간 GeoJSON은 Git에 포함하지 않습니다. 배포에서 전국 경계를 표시하려면 PMTiles 파일만 포함하거나 별도 정적 스토리지에 업로드한 뒤 경로를 맞춰 주세요.
