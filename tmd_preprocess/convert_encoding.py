import pandas as pd

input_path = "국토교통부 국토지리정보원_공간정보공동활용_읍면동_20230915.csv"
output_path = "eupmyeondong_utf8.csv"

encodings = ["utf-8-sig", "utf-8", "cp949", "euc-kr"]

df = None
used_encoding = None

for enc in encodings:
    try:
        df = pd.read_csv(input_path, encoding=enc)
        used_encoding = enc
        print(f"[SUCCESS] encoding detected: {enc}")
        break
    except Exception as e:
        print(f"[FAIL] {enc}")

if df is None:
    raise Exception("❌ 인코딩 감지 실패")

# 컬럼명 정리
df.columns = df.columns.str.strip()

# 주요 컬럼 체크
required = ["읍면동코드", "읍면동명", "공간정보"]
for col in required:
    if col not in df.columns:
        raise Exception(f"❌ 컬럼 없음: {col}")

# 데이터 정리
df["읍면동명"] = df["읍면동명"].astype(str).str.strip()
df["읍면동코드"] = df["읍면동코드"].astype(str).str.strip()

# 공간정보 null 제거
df = df.dropna(subset=["공간정보"])

print(f"[INFO] row count: {len(df)}")

# UTF-8로 저장
df.to_csv(output_path, index=False, encoding="utf-8-sig")

print(f"[DONE] saved → {output_path}")