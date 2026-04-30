param(
  [string]$GeoJsonInput = "public/geo/eupmyeondong.geojson",
  [string]$PmtilesOutput = "public/tiles/eupmyeondong_z5_z13_detail.pmtiles",
  [string]$LayerName = "eupmyeondong"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$inputPath = Join-Path $repoRoot $GeoJsonInput
$outputPath = Join-Path $repoRoot $PmtilesOutput
$outputDir = Split-Path $outputPath -Parent

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

tippecanoe `
  -o $outputPath `
  -l $LayerName `
  -Z5 `
  -z13 `
  --no-feature-limit `
  --no-tile-size-limit `
  --no-tiny-polygon-reduction `
  --no-line-simplification `
  --force `
  $inputPath

Write-Host "Vector tile build complete: $PmtilesOutput"
