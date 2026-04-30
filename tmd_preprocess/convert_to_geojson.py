import pandas as pd
from shapely import wkb
from shapely.ops import transform
from pyproj import Transformer
import json

INPUT = "eupmyeondong_utf8.csv"
OUTPUT = "eupmyeondong.geojson"

# 좌표계 변환 (중요)
# 대부분 국토지리정보원 데이터는 EPSG:5179 또는 5181
# → WGS84 (EPSG:4326)로 변환
transformer = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)

def convert_geom(hex_wkb):
    geom = wkb.loads(bytes.fromhex(hex_wkb))
    geom = transform(transformer.transform, geom)
    return geom.__geo_interface__

df = pd.read_csv(INPUT)

features = []

for _, row in df.iterrows():
    try:
        geometry = convert_geom(row["공간정보"])

        feature = {
            "type": "Feature",
            "properties": {
                "emd_code": str(row["읍면동코드"]),
                "emd_name": row["읍면동명"],
                "sig_code": str(row["객체시군구코드"]),
                "object_id": int(row["오브젝트아이디"]),
            },
            "geometry": geometry
        }

        features.append(feature)

    except Exception as e:
        print(f"❌ 실패: {row['읍면동명']}", e)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(geojson, f, ensure_ascii=False)

print(f"✅ 완료: {len(features)} features 생성됨")