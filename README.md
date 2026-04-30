# Life Map Diary

전국 읍면동 단위로 일상 기록과 사진을 남기는 개인 기록 지도입니다. 학교, 산책, 카페, 약속, 공부, 운동처럼 평범한 하루의 장소를 지역별로 쌓아 나만의 생활 지도로 정리할 수 있습니다. 네이버 지도를 배경으로 사용하고, 전국 읍면동 경계는 PMTiles 벡터 타일을 MapLibre GL JS 투명 overlay로 렌더링합니다.

## 주요 기능

- 전국 읍면동 경계 표시
- 기록 횟수 단계별 파란색 그라데이션 시각화
- 지도별 일상 기록과 사진 관리
- 지도 생성, 선택, 수정, 공유, 삭제
- Supabase Auth 기반 로그인/회원가입/프로필
- 선택 지역별 기록 타임라인과 전체 일상 기록 타임라인
- 사용자가 직접 고르는 기록 날짜(`entry_date`)
- 타임라인 정렬: 기록 날짜 최신순, 기록 날짜 오래된순, 작성일 최신순
- 기록한 지역 수, 총 기록 횟수, 가장 자주 기록한 지역, 기록 비율을 보여주는 일상 통계
- 기록 없음, 1회, 2~3회, 4~6회, 7회 이상 기록 상태 범례

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase Auth / Database / Storage
- Supabase CLI migrations
- Naver Maps JavaScript API
- MapLibre GL JS
- PMTiles

## 지도 렌더링 구조

현재 지도는 Naver Map 배경 + MapLibre PMTiles overlay 구조입니다.

```text
Naver Map Background
→ Transparent MapLibre Overlay
→ PMTiles 읍면동 Boundary Layer
```

- 배경지도: Naver Maps JavaScript API
- 경계 overlay: MapLibre GL JS
- 벡터 타일 파일: `public/tiles/eupmyeondong.pmtiles`
- PMTiles source id: `eupmyeondong`
- PMTiles source-layer: `eupmyeondong`
- source zoom: min `5`, max `13`
- feature properties: `sido_code`, `sido_name`, `sig_code`, `derived_sig_code`, `sig_name`, `emd_code`, `emd_name`, `full_name`, `object_id`
- 대용량 GeoJSON 직접 fetch 방식은 사용하지 않습니다.
- 색상 규칙: 기록 없음은 옅은 회하늘색, 기록 횟수가 많아질수록 `#BDE8F5` → `#4988C4` → `#1C4D8D` → `#0F2854` 순서로 진해집니다.

Naver Map과 MapLibre overlay의 zoom 스케일이 맞지 않으면 `NEXT_PUBLIC_MAPLIBRE_ZOOM_OFFSET`으로 보정합니다. 현재 확인된 기본 보정값은 `-1`입니다.

브라우저 콘솔에서 즉시 테스트할 수도 있습니다.

```js
window.__setOverlayZoomOffset(-1)
```

## 데이터 모델 참고

기존 DB 호환을 위해 일부 필드명은 `dong_code`, `dong_name`을 유지합니다.

- `dong_code`: legacy field name, now stores nationwide `emd_code`
- `dong_name`: legacy field name, now stores nationwide `emd_name`

사용자에게 보이는 UI에서는 “지역” 또는 “읍면동” 표현을 사용합니다.

## 행정구역 표기 정책

전국 지도에서는 같은 읍면동명이 여러 지역에 존재할 수 있으므로, UI 표기는 가능한 경우 행정계층을 함께 보여줍니다.

표기 우선순위:

1. PMTiles property의 `full_name`
2. `sido_name + sig_name + emd_name`
3. `SIDO_CODE_MAP + SIGUNGU_CODE_MAP + emd_name`
4. `SIDO_CODE_MAP + emd_name`
5. `emd_name`

현재 런타임은 `emd_code` 앞 2자리로 시도명을 찾고, `emd_code` 앞 5자리 또는 `sig_code`로 시군구명을 찾습니다. 일부 원본 데이터의 `객체시군구코드`는 통합시의 일반구가 아니라 상위 시 코드로 들어올 수 있으므로, 더 구체적인 `emd_code` 앞 5자리 매핑을 먼저 사용합니다. 시군구 매핑은 [lib/sigungu-code-map.json](./lib/sigungu-code-map.json)에 분리되어 있으며, PMTiles 재생성 시 `sido_name`, `sig_name`, `full_name`을 property에 포함하면 프론트 매핑 의존도를 줄일 수 있습니다.

시군구 매핑 검증/재생성:

```bash
python tmd_preprocess/build_sigungu_code_map.py \
  --emd-csv "tmd_preprocess/eupmyeondong_utf8.csv" \
  --seed-json "lib/sigungu-code-map.json" \
  --output "lib/sigungu-code-map.json"
```

별도 행정구역 코드 CSV가 있으면 `--admin-code-csv`로 병합할 수 있습니다.

## 환경 변수

프로젝트 루트의 `.env.local`과 Vercel Project Settings > Environment Variables에 같은 이름으로 등록합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=your_naver_map_client_id

# Optional debug/tuning
NEXT_PUBLIC_MAPLIBRE_ZOOM_OFFSET=-1
NEXT_PUBLIC_DEBUG_BOUNDARY_STYLE=false
NEXT_PUBLIC_DEBUG_OVERLAY_BACKGROUND=false
NEXT_PUBLIC_DEBUG_OVERLAY_STACK=false
NEXT_PUBLIC_DEBUG_MAP_OVERLAY=false
NEXT_PUBLIC_DEBUG_FIXED_OVERLAY_VIEW=false
NEXT_PUBLIC_DEBUG_REGION_LABEL=false
NEXT_PUBLIC_PMTILES_URL=
```

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anon/public key
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`: Naver Maps JavaScript API Client ID
- `NEXT_PUBLIC_MAPLIBRE_ZOOM_OFFSET`: Naver Map과 MapLibre overlay zoom 보정값. 경계와 배경이 어긋나면 `-2`, `-1`, `0`, `1`, `2`를 테스트합니다.
- `NEXT_PUBLIC_DEBUG_BOUNDARY_STYLE`: `true`일 때 PMTiles 경계를 강한 빨간색/검정색으로 표시합니다.
- `NEXT_PUBLIC_DEBUG_OVERLAY_BACKGROUND`: `true`일 때 overlay 영역을 옅은 빨간 배경으로 표시합니다.
- `NEXT_PUBLIC_DEBUG_OVERLAY_STACK`: `true`일 때 PMTiles overlay와 canvas에 강한 z-index, 빨간/파란 outline을 적용해 stacking 문제를 확인합니다.
- `NEXT_PUBLIC_DEBUG_MAP_OVERLAY`: `true`일 때 지도 위에 PMTiles source/layer/render 상태 패널을 표시합니다.
- `NEXT_PUBLIC_DEBUG_FIXED_OVERLAY_VIEW`: `true`일 때 MapLibre overlay를 고정 테스트 뷰로 표시합니다.
- `NEXT_PUBLIC_DEBUG_REGION_LABEL`: `true`일 때 Safari 한글 깨짐 확인용으로 지역 raw properties와 최종 표시 라벨을 최대 10개만 출력합니다.
- `NEXT_PUBLIC_PMTILES_URL`: 선택값. 외부 Storage/CDN에 PMTiles를 올릴 때 절대 URL을 지정합니다. 없으면 `/tiles/eupmyeondong.pmtiles`를 사용합니다.

보안 주의:

- Supabase service role key는 클라이언트 코드와 `NEXT_PUBLIC_*` 환경 변수에 절대 넣지 않습니다.
- 브라우저에서는 Supabase anon key만 사용합니다.
- 사용자 권한은 Supabase RLS와 Storage 정책으로 제어합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

기본 접속 주소:

```text
http://localhost:3000
```

## Supabase CLI Migration

데이터베이스 스키마는 `supabase/migrations`의 SQL migration으로 관리합니다. VSCode에서 SQL 파일을 작성하는 것만으로는 원격 Supabase DB에 반영되지 않으므로, 링크된 프로젝트에 migration을 push해야 합니다.

현재 project ref:

```text
kpibshapazejhkgblrmb
```

명령:

```bash
npx supabase login
npm run db:link
npm run db:status
npm run db:push
```

주요 테이블:

- `public.maps`
- `public.map_members`
- `public.user_profiles`
- `public.visited_places`
- `public.dong_diaries`

자세한 사용 순서는 [supabase/README.md](./supabase/README.md)를 참고하세요.

## PMTiles 생성 및 관리

전국 읍면동 경계는 런타임에서 GeoJSON을 직접 불러오지 않고 PMTiles로 렌더링합니다.

데이터 흐름:

```text
원본 CSV
→ UTF-8 전처리 CSV
→ WKB/EWKB geometry 파싱
→ GeoJSON 생성
→ PMTiles 생성
→ public/tiles/eupmyeondong.pmtiles
```

인코딩 전처리:

```bash
cd tmd_preprocess
python convert_encoding.py
```

GeoJSON 생성:

```bash
python tmd_preprocess/convert_to_geojson.py \
  --input "tmd_preprocess/eupmyeondong_utf8.csv" \
  --output "public/geo/eupmyeondong.geojson" \
  --sigungu-map "lib/sigungu-code-map.json" \
  --source-crs EPSG:4326
```

PMTiles 생성:

```bash
npm run tiles:build
```

PMTiles property를 최신화하려면 다음 순서로 다시 생성합니다.

1. CSV 전처리
2. `lib/sigungu-code-map.json` 검증/재생성
3. GeoJSON 재생성
4. PMTiles 재생성
5. `public/tiles/eupmyeondong.pmtiles` 교체

`npm run tiles:build`는 `tippecanoe` CLI가 필요합니다. Windows에서는 WSL, Docker, macOS/Linux 환경에서 `tippecanoe`를 설치한 뒤 실행하세요.
현재 빌드 스크립트는 상세 경계를 위해 `-Z5 -z13`, `--no-feature-limit`, `--no-tile-size-limit`, `--no-tiny-polygon-reduction`, `--no-line-simplification` 옵션을 사용합니다.
생성 후 `tmd_preprocess/fix_pmtiles_metadata_compression.cjs`가 PMTiles metadata 압축 정보를 보정합니다. 이 보정이 없으면 파일은 200 OK로 응답해도 브라우저에서 metadata/header 읽기에 실패할 수 있습니다.

생성 결과:

- PMTiles 파일: `public/tiles/eupmyeondong.pmtiles`
- source id: `eupmyeondong`
- source-layer: `eupmyeondong`
- source zoom: min `5`, max `13`
- properties: `sido_code`, `sido_name`, `sig_code`, `derived_sig_code`, `sig_name`, `emd_code`, `emd_name`, `full_name`, `object_id`

### PMTiles 경계 seam 완화 정책

읍면동 내부에 타일 경계 기준 직선이 보이면 PMTiles를 다시 생성해야 합니다. 현재 `npm run tiles:build`는 다음 정책을 사용합니다.

- `emd_code` 기준 dissolve 전처리: `tmd_preprocess/eupmyeondong_dissolved.geojson` 생성
- tippecanoe buffer: `--buffer=128`
- 상세 경계 유지: `--no-line-simplification`, `--no-tiny-polygon-reduction`
- feature/tile size drop 방지: `--no-feature-limit`, `--no-tile-size-limit`
- shared border 처리: `--detect-shared-borders`
- 기본 zoom: `-Z5 -z13`

더 세밀한 경계가 필요하면 `npm run tiles:build -- -MaxZoom 14`로 재생성할 수 있습니다. 이 경우 프론트의 `EUPMYEONDONG_SOURCE_MAX_ZOOM`도 같은 값으로 맞춰야 합니다.

PMTiles 파일이 없으면 전국 읍면동 경계가 표시되지 않습니다.

## 지도 데이터 파일 정책

대용량 원본/중간 데이터는 Git에 포함하지 않습니다.

- 원본 CSV: Git 제외
- UTF-8 전처리 CSV: Git 제외
- 대용량 GeoJSON: Git 제외
- 앱 런타임/배포에는 PMTiles 파일만 사용
- PMTiles 파일은 배포 정책에 따라 Git 포함 여부를 결정합니다.

현재 `.gitignore`는 CSV와 중간 GeoJSON을 제외합니다. Vercel에서 전국 경계를 표시하려면 `public/tiles/eupmyeondong.pmtiles`가 배포 산출물에 포함되어야 합니다.

## UI 구조

메인 지도:

- 전국 지도 중심
- 기록 여부 색상 표시
- 선택 지역 정보 표시
- hover 시 읍면동명 표시

Drawer:

- 지도: 현재 지도 정보
- 설정: 지도 생성, 지도 정보 수정, 공유 관리, 지도 삭제
- 일상 통계: 기록한 지역 수, 총 기록 횟수, 가장 자주 기록한 지역, 기록 비율
- 기록 현황: 기록 없음, 1회 기록, 2~3회 기록, 4~6회 기록, 7회 이상 기록, 기록 상위 지역, 선택된 지역, 범례
- 전체 일상 기록: 현재 지도 전체 지역 기록, `entry_date` 기준 정렬
- 계정: 사용자 정보, 프로필, 로그아웃

지역 팝업/바텀시트:

- 지역명
- 기록 횟수
- 지역별 기록 타임라인
- 기록 추가
- 사진 표시

## 배포 방법

### 1. Vercel 배포

1. GitHub 저장소를 Vercel에 Import합니다.
2. Framework Preset은 `Next.js`로 둡니다.
3. Root Directory는 프로젝트 루트(`travel-map-diary`)로 설정합니다.
4. Install Command는 `npm install`, Build Command는 `npm run build`를 사용합니다.
5. Vercel 환경 변수에 Supabase와 Naver Maps 값을 등록합니다.
6. `public/tiles/eupmyeondong.pmtiles` 포함 여부를 확인합니다.

### 2. Supabase Auth URL

Supabase Dashboard > Authentication > URL Configuration에서 배포 도메인을 등록합니다.

- Site URL: `https://배포도메인.vercel.app`
- Redirect URLs:
  - `https://배포도메인.vercel.app`
  - `https://배포도메인.vercel.app/login`
  - `https://배포도메인.vercel.app/signup`
  - `https://배포도메인.vercel.app/profile`

Preview 배포를 테스트할 때는 해당 Preview URL도 Redirect URLs에 추가합니다.

### 3. Naver Cloud 도메인

Naver Cloud Platform의 Maps API 인증 도메인에 로컬/배포 URL을 등록합니다.

- `http://localhost:3000`
- `https://배포도메인.vercel.app`

### 4. Supabase Migration

배포 전 원격 DB에 migration을 적용합니다.

```bash
npm run db:status
npm run db:push
```

### 5. 배포 전 체크리스트

- `npm.cmd run lint` 통과
- `npm run build` 통과
- Vercel 환경 변수 등록
- Supabase Auth Redirect URL 등록
- Naver Cloud 인증 도메인 등록
- Supabase migration 적용
- `public/tiles/eupmyeondong.pmtiles` 존재 확인

### 6. 배포 후 테스트 체크리스트

- 홈 접속
- Naver 지도 배경 로딩
- PMTiles 읍면동 경계 표시
- hover 시 읍면동명 표시
- click 시 지역별 기록 타임라인 패널 표시
- 로그인 / 회원가입 / 로그아웃
- 지도 생성 / 선택 / 수정 / 공유 / 삭제
- 기록 저장
- 사진 업로드 및 표시
- 새로고침 후 세션 유지
- 기록 지역 색상 반영
- 지도 전환 시 일상 통계/기록/색상 갱신

## 검증

최근 확인한 명령:

```bash
npm.cmd run lint
npm.cmd run build
```

`next/font`가 Google Fonts를 가져오기 때문에 네트워크가 차단된 환경에서는 `npm run build`가 Google Fonts fetch 단계에서 실패할 수 있습니다.

## PMTiles 라벨 재생성 주의

GeoJSON의 `sido_name`, `sig_name`, `full_name` property 또는 `lib/sigungu-code-map.json`을 수정했다면 기존 PMTiles에는 자동 반영되지 않습니다. `tmd_preprocess/convert_to_geojson.py`로 GeoJSON을 다시 생성한 뒤 `npm run tiles:build`로 `public/tiles/eupmyeondong.pmtiles`를 반드시 재생성하세요. 기존 PMTiles를 그대로 사용하면 hover/선택 지역명이 깨진 상태로 계속 표시될 수 있습니다.
