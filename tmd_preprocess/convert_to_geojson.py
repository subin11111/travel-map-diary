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


def parse_args():
    parser = argparse.ArgumentParser(
        description="Convert eup/myeon/dong WKB CSV to GeoJSON."
    )
    parser.add_argument("--input", default="eupmyeondong_utf8.csv")
    parser.add_argument("--output", default="eupmyeondong.geojson")
    parser.add_argument(
        "--source-crs",
        default="EPSG:4326",
        choices=["EPSG:5179", "EPSG:5181", "EPSG:5186", "EPSG:5187", "EPSG:4326"],
        help="Source CRS of the WKB geometry. The current 20230915 file is already EPSG:4326.",
    )
    return parser.parse_args()


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

            raw_total_bounds = update_bounds(raw_total_bounds, raw_bounds)
            converted_total_bounds = update_bounds(converted_total_bounds, geom.bounds)

            feature = {
                "type": "Feature",
                "properties": {
                    "emd_code": str(row["읍면동코드"]),
                    "emd_name": row["읍면동명"],
                    "sig_code": str(row["객체시군구코드"]),
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
