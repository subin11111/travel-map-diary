import argparse
import json
from pathlib import Path

import pandas as pd
from pyproj import Transformer
from shapely import wkb
from shapely.ops import transform


REQUIRED_COLUMNS = [
    "공간정보일렬번호",
    "읍면동코드",
    "읍면동명",
    "객체시군구코드",
    "오브젝트아이디",
    "공간정보",
]

SIDO_CODE_MAP = {
    "11": "서울특별시",
    "26": "부산광역시",
    "27": "대구광역시",
    "28": "인천광역시",
    "29": "광주광역시",
    "30": "대전광역시",
    "31": "울산광역시",
    "36": "세종특별자치시",
    "41": "경기도",
    "42": "강원특별자치도",
    "43": "충청북도",
    "44": "충청남도",
    "45": "전북특별자치도",
    "46": "전라남도",
    "47": "경상북도",
    "48": "경상남도",
    "50": "제주특별자치도",
    "51": "강원특별자치도",
    "52": "전북특별자치도",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert eup/myeon/dong WKB CSV to GeoJSON."
    )
    parser.add_argument("--input", default="eupmyeondong_utf8.csv")
    parser.add_argument("--output", default="eupmyeondong.geojson")
    parser.add_argument(
        "--sigungu-map",
        default="lib/sigungu-code-map.json",
        help="Optional JSON map from sig_code to sigungu name.",
    )
    parser.add_argument(
        "--source-crs",
        default="EPSG:4326",
        choices=["EPSG:5179", "EPSG:5181", "EPSG:5186", "EPSG:5187", "EPSG:4326"],
        help="Source CRS of the WKB geometry. The current 20230915 file is already EPSG:4326.",
    )
    return parser.parse_args()


def load_sigungu_map(path_value):
    path = Path(path_value)

    if not path.exists():
        print(f"sigungu map not found, continuing without sig_name: {path}")
        return {}

    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return {str(key): str(value) for key, value in data.items()}


def format_full_name(sido_name, sig_name, emd_name):
    if sido_name and sig_name:
        return f"{sido_name} {sig_name} {emd_name}"

    if sido_name:
        return f"{sido_name} {emd_name}"

    return emd_name


def update_bounds(bounds, geom_bounds):
    minx, miny, maxx, maxy = geom_bounds

    return {
        "minLng": min(bounds["minLng"], minx),
        "minLat": min(bounds["minLat"], miny),
        "maxLng": max(bounds["maxLng"], maxx),
        "maxLat": max(bounds["maxLat"], maxy),
    }


def first_coordinate(geometry):
    if geometry["type"] == "Polygon":
        return geometry["coordinates"][0][0]

    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"][0][0][0]

    return None


def convert_geom(hex_wkb, transformer):
    geom = wkb.loads(bytes.fromhex(str(hex_wkb)))
    raw_bounds = geom.bounds

    if transformer is not None:
        geom = transform(transformer.transform, geom)

    return geom, raw_bounds


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    df = pd.read_csv(input_path, dtype=str)
    df.columns = [column.strip() for column in df.columns]

    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing_columns:
        raise ValueError(f"필수 컬럼이 없습니다: {', '.join(missing_columns)}")

    df["읍면동코드"] = df["읍면동코드"].astype(str).str.strip()
    df["객체시군구코드"] = df["객체시군구코드"].astype(str).str.strip()
    df["읍면동명"] = df["읍면동명"].astype(str).str.strip()
    df = df.dropna(subset=["공간정보"])
    df = df[df["공간정보"].astype(str).str.strip() != ""]
    sigungu_map = load_sigungu_map(args.sigungu_map)

    transformer = None
    if args.source_crs != "EPSG:4326":
        transformer = Transformer.from_crs(args.source_crs, "EPSG:4326", always_xy=True)

    features = []
    raw_total_bounds = {
        "minLng": float("inf"),
        "minLat": float("inf"),
        "maxLng": float("-inf"),
        "maxLat": float("-inf"),
    }
    converted_total_bounds = raw_total_bounds.copy()
    first_feature_sample = None

    for _, row in df.iterrows():
        try:
            geom, raw_bounds = convert_geom(row["공간정보"], transformer)
            geometry = geom.__geo_interface__
            emd_code = str(row["읍면동코드"])
            emd_name = row["읍면동명"]
            sig_code = str(row["객체시군구코드"])
            derived_sig_code = emd_code[:5]
            sido_code = emd_code[:2]
            sido_name = SIDO_CODE_MAP.get(sido_code)
            sig_name = sigungu_map.get(derived_sig_code) or sigungu_map.get(sig_code)

            raw_total_bounds = update_bounds(raw_total_bounds, raw_bounds)
            converted_total_bounds = update_bounds(converted_total_bounds, geom.bounds)

            feature = {
                "type": "Feature",
                "properties": {
                    "sido_code": sido_code,
                    "sido_name": sido_name,
                    "sig_code": sig_code,
                    "derived_sig_code": derived_sig_code,
                    "sig_name": sig_name,
                    "emd_code": emd_code,
                    "emd_name": emd_name,
                    "full_name": format_full_name(sido_name, sig_name, emd_name),
                    "object_id": int(row["오브젝트아이디"]),
                },
                "geometry": geometry,
            }

            if first_feature_sample is None:
                first_feature_sample = {
                    "emd_code": feature["properties"]["emd_code"],
                    "emd_name": feature["properties"]["emd_name"],
                    "geometry_type": geometry["type"],
                    "first_coordinate": first_coordinate(geometry),
                }

            features.append(feature)
        except Exception as error:
            print(f"실패: {row.get('읍면동명', 'unknown')} {error}")

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(geojson, file, ensure_ascii=False)

    seoul_count = sum(
        1 for feature in features if feature["properties"]["emd_code"].startswith("11")
    )

    print(f"source CRS: {args.source_crs}")
    print(f"raw bounds: {raw_total_bounds}")
    print(f"converted bounds: {converted_total_bounds}")
    print(f"first feature sample: {first_feature_sample}")
    print(f"seoul feature count: {seoul_count}")
    print(f"output: {output_path}")
    print(f"done: {len(features)} features")


if __name__ == "__main__":
    main()
