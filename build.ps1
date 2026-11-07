Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath "node_modules")) {
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm run build
