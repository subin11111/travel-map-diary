import argparse
import json
from pathlib import Path

import pandas as pd


CODE_COLUMN_CANDIDATES = [
    "법정동코드",
    "행정구역코드",
    "시군구코드",
    "sig_code",
    "code",
]
NAME_COLUMN_CANDIDATES = [
    "법정동명",
    "행정구역명",
    "시군구명",
    "sig_name",
    "name",
]


def parse_args():
    parser = argparse.ArgumentParser(
        description="Build and validate a nationwide sigungu code map."
    )
    parser.add_argument("--emd-csv", default="tmd_preprocess/eupmyeondong_utf8.csv")
    parser.add_argument("--seed-json", default="lib/sigungu-code-map.json")
    parser.add_argument("--admin-code-csv", default=None)
    parser.add_argument("--output", default="lib/sigungu-code-map.json")
    return parser.parse_args()


def read_json_map(path):
    json_path = Path(path)

    if not json_path.exists():
        return {}

    with json_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    return {str(key): str(value) for key, value in data.items()}


def find_column(columns, candidates):
    for candidate in candidates:
        if candidate in columns:
            return candidate

    return None


def read_admin_code_map(path):
    if not path:
        return {}

    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
    df.columns = [column.strip() for column in df.columns]
    code_column = find_column(df.columns, CODE_COLUMN_CANDIDATES)
    name_column = find_column(df.columns, NAME_COLUMN_CANDIDATES)

    if not code_column or not name_column:
        raise ValueError(
            "admin-code-csv must include a recognizable code/name column pair."
        )

    result = {}
    for _, row in df.iterrows():
        code = str(row[code_column]).strip()[:5]
        name = str(row[name_column]).strip().split()[-1]

        if len(code) == 5 and name and name != "nan":
            result[code] = name

    return result


def read_required_sigungu_codes(emd_csv_path):
    df = pd.read_csv(emd_csv_path, usecols=[1, 3], dtype=str, encoding="utf-8-sig")
    df.columns = ["emd_code", "sig_code"]

    required = set()
    for _, row in df.iterrows():
        emd_code = str(row["emd_code"]).strip()
        sig_code = str(row["sig_code"]).strip()

        if len(emd_code) >= 5:
            required.add(emd_code[:5])

        if len(sig_code) == 5:
            required.add(sig_code)

    return required


def main():
    args = parse_args()
    code_map = read_json_map(args.seed_json)
    code_map.update(read_admin_code_map(args.admin_code_csv))

    required_codes = read_required_sigungu_codes(args.emd_csv)
    missing = sorted(code for code in required_codes if code not in code_map)

    if missing:
        raise ValueError(f"Missing sigungu codes: {', '.join(missing)}")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(dict(sorted(code_map.items())), file, ensure_ascii=False, indent=2)
        file.write("\n")

    print(
        json.dumps(
            {
                "output": str(output_path),
                "map_count": len(code_map),
                "required_count": len(required_codes),
                "missing_count": len(missing),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
