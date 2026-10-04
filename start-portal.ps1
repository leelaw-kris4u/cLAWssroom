# cLAWssroom - Indian Legal Chambers Portal Launcher
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  cLAWssroom | Advocate's Chambers & Indian Court Portal" -ForegroundColor Yellow
Write-Host "  Jurisdiction: Republic of India" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Cyan

Start-Process "http://localhost:3000"

$agyNode = "$env:APPDATA\Antigravity\bin\agy-node.cmd"
if (Test-Path $agyNode) {
    & $agyNode server.js
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    node server.js
} else {
    & "agy-node.cmd" server.js
}
