# autostart-uninstall.ps1 - Go autostart da cai bang autostart-install.ps1.
#   powershell -ExecutionPolicy Bypass -File .\autostart-uninstall.ps1

$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')

$removed = $false
foreach ($name in @('Calendar App.cmd', 'Calendar App.lnk', 'calendar-app-autostart.vbs')) {
    $p = Join-Path $startup $name
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Write-Host "Da go: $p" -ForegroundColor Green
        $removed = $true
    }
}
if (-not $removed) { Write-Host "Khong co gi de go (chua cai)." -ForegroundColor Yellow }
Write-Host "Server dang chay van tiep tuc; dong 2 cua so 'CALENDAR ...' de tat han."
