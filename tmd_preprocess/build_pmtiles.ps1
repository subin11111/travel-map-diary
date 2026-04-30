param(
  [string]$GeoJsonInput = "public/geo/eupmyeondong.geojson",
  [string]$PmtilesOutput = "public/tiles/eupmyeondong.pmtiles",
  [string]$LayerName = "eupmyeondong",
  [int]$MinZoom = 5,
  [int]$MaxZoom = 13,
  [int]$Buffer = 128,
  [bool]$Dissolve = $true,
  [string]$DissolvedOutput = "tmd_preprocess/eupmyeondong_dissolved.geojson"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$inputPath = Join-Path $repoRoot $GeoJsonInput
$outputPath = Join-Path $repoRoot $PmtilesOutput
$outputDir = Split-Path $outputPath -Parent
$tileInputPath = $inputPath

if (-not (Get-Command tippecanoe -ErrorAction SilentlyContinue)) {
  throw "tippecanoe CLI가 필요합니다. WSL/macOS/Linux에서 tippecanoe를 설치한 뒤 다시 실행하세요."
}

if (-not (Test-Path $inputPath)) {
  throw "GeoJSON 입력 파일을 찾을 수 없습니다: $GeoJsonInput"
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

Write-Host "Vector tile build started"
Write-Host "Input:  $GeoJsonInput"
Write-Host "Output: $PmtilesOutput"
Write-Host "Layer:  $LayerName"
Write-Host "Zoom:   z$MinZoom-z$MaxZoom"
Write-Host "Buffer: $Buffer"

if ($Dissolve) {
  $dissolvedPath = Join-Path $repoRoot $DissolvedOutput
  $dissolvedDir = Split-Path $dissolvedPath -Parent
  New-Item -ItemType Directory -Force -Path $dissolvedDir | Out-Null

  Write-Host "Dissolving features by emd_code before tile build"
  python (Join-Path $repoRoot "tmd_preprocess/dissolve_geojson_by_emd_code.py") `
    --input $inputPath `
    --output $dissolvedPath

  $tileInputPath = $dissolvedPath
  Write-Host "Tile input: $DissolvedOutput"
}

tippecanoe `
  -o $outputPath `
  -l $LayerName `
  -Z$MinZoom `
  -z$MaxZoom `
  --buffer=$Buffer `
  --no-feature-limit `
  --no-tile-size-limit `
  --no-tiny-polygon-reduction `
  --no-line-simplification `
  --detect-shared-borders `
  --force `
  $tileInputPath

node (Join-Path $repoRoot "tmd_preprocess/fix_pmtiles_metadata_compression.cjs") $outputPath

Write-Host "Vector tile build complete: $PmtilesOutput"
