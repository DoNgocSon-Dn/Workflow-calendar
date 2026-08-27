# autostart-install.ps1
#
# Cai dat: moi lan DANG NHAP Windows, backend + frontend tu bat (chay
# start-dev.ps1 -Auto o che do an). Khong can quyen Administrator.
#
# Chay 1 lan:  powershell -ExecutionPolicy Bypass -File .\autostart-install.ps1
# Go:          powershell -ExecutionPolicy Bypass -File .\autostart-uninstall.ps1
#
# Tuy chon:  -OpenBrowser   Tu mo http://localhost:4200 sau khi san sang.

param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$script = Join-Path $root 'start-dev.ps1'
if (-not (Test-Path -LiteralPath $script)) { throw "Khong thay $script" }

$startup = [Environment]::GetFolderPath('Startup')
$cmdPath = Join-Path $startup 'Calendar App.cmd'

# Dung file .cmd (khong dung .lnk): shortcut .lnk tao bang WScript.Shell hong
# duong dan co dau tieng Viet (app-lich). .cmd + "chcp 65001" + luu UTF-8 doc
# dung duong dan Unicode.
$psArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '" -Auto'
if ($OpenBrowser) { $psArgs += ' -OpenBrowser' }

$lines = @(
    '@echo off'
    'chcp 65001 >nul'
    ('start "" /min powershell ' + $psArgs)
)
$content = ($lines -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText($cmdPath, $content, (New-Object System.Text.UTF8Encoding($false)))

# Don shortcut cu neu tung cai ban .lnk
$oldLnk = Join-Path $startup 'Calendar App.lnk'
if (Test-Path -LiteralPath $oldLnk) { Remove-Item -LiteralPath $oldLnk -Force }

Write-Host "Da cai autostart:" -ForegroundColor Green
Write-Host "  $cmdPath"
Write-Host ""
Write-Host "Lan dang nhap Windows toi, 2 cua so 'CALENDAR ...' tu bat (thu nho o taskbar)."
Write-Host "Log moi lan chay nam trong: $root\logs\"
Write-Host ""
Write-Host "Chay thu ngay (khong can dang xuat):" -ForegroundColor Cyan
Write-Host ("  powershell -ExecutionPolicy Bypass -File `"{0}`"" -f $script)
