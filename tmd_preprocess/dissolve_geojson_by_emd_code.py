import argparse
import json
from collections import defaultdict
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union


def parse_args():
    parser = argparse.ArgumentParser(
        description="Dissolve eup/myeon/dong GeoJSON features by emd_code before building PMTiles."
    )
    parser.add_argument("--input", required=True, help="Input GeoJSON FeatureCollection.")
    parser.add_argument("--output", required=True, help="Output dissolved GeoJSON FeatureCollection.")
    return parser.parse_args()


def normalize_geometry(geometry):
    if geometry.is_valid:
        return geometry

    return geometry.buffer(0)


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    with input_path.open("r", encoding="utf-8") as file:
        geojson = json.load(file)

    grouped = defaultdict(list)
    properties_by_code = {}
    missing_code_count = 0

    for feature in geojson.get("features", []):
        properties = feature.get("properties") or {}
        emd_code = properties.get("emd_code")

        if not emd_code:
            missing_code_count += 1
            continue

        grouped[str(emd_code)].append(shape(feature["geometry"]))
        properties_by_code.setdefault(str(emd_code), properties)

    dissolved_features = []
    multi_feature_groups = 0

    for emd_code, geometries in grouped.items():
        if len(geometries) > 1:
            multi_feature_groups += 1

        cleaned_geometries = [normalize_geometry(geometry) for geometry in geometries]
        dissolved_geometry = normalize_geometry(unary_union(cleaned_geometries))

        dissolved_features.append(
            {
                "type": "Feature",
                "properties": properties_by_code[emd_code],
                "geometry": mapping(dissolved_geometry),
            }
        )

    dissolved_geojson = {
        "type": "FeatureCollection",
        "features": dissolved_features,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8", newline="\n") as file:
        json.dump(dissolved_geojson, file, ensure_ascii=False, separators=(",", ":"))

    print("Dissolve complete")
    print(f"input: {input_path}")
    print(f"output: {output_path}")
    print(f"input features: {len(geojson.get('features', []))}")
    print(f"output features: {len(dissolved_features)}")
    print(f"multi-feature emd_code groups: {multi_feature_groups}")
    print(f"features skipped without emd_code: {missing_code_count}")


if __name__ == "__main__":
    main()
