# start-dev.ps1 - Bat backend + frontend dung thu tu cho app lich.
#
# Dung tay:      powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
# Tham so:
#   -Auto         Khong hoi gi (dung khi chay tu dong luc dang nhap Windows).
#   -OpenBrowser  Mo http://localhost:4200 khi frontend san sang.
#   -Minimized    Cua so backend/frontend thu nho (mac dinh khi -Auto).
#
# Vi sao: "Chap nhan loi moi vao nhom" di qua backend NestJS (cong 3000) roi
# moi toi Supabase. Mo app khi backend chua san sang -> nut Chap nhan bao
# "Khong the xu ly loi moi. Vui long thu lai." Script bat backend truoc, DOI
# cong 3000 tra loi, roi moi bat frontend.

param(
    [switch]$Auto,
    [switch]$OpenBrowser,
    [switch]$Minimized
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'

$supabaseHost = 'wdiuuhsfflragxuurwpk.supabase.co'
$backendPort = 3000
$frontendPort = 4200
$frontendUrl = "http://localhost:$frontendPort"

if ($Auto) { $Minimized = $true }
if ($Minimized) { $childStyle = 'Minimized' } else { $childStyle = 'Normal' }

# --- Log ra file de lan chay tu dong van xem duoc loi ---
$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $logDir ("start-dev-$stamp.log")
try { Start-Transcript -Path $logFile | Out-Null } catch { }

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    OK  $m" -ForegroundColor Green }
function Write-Note { param($m) Write-Host "    !   $m" -ForegroundColor Yellow }

# Co ai lang nghe o host:port khong (TCP connect, khong dung HTTP -> khong sinh
# loi nhieu trong log).
function Test-Port {
    param($tcpHost, $port, $timeoutMs = 2000)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect($tcpHost, $port, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne($timeoutMs)) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Wait-Port {
    param($tcpHost, $port, $label, $maxSeconds = 90)
    for ($i = 1; $i -le $maxSeconds; $i++) {
        if (Test-Port $tcpHost $port) { return $true }
        Start-Sleep -Seconds 1
        if (($i % 5) -eq 0) { Write-Host "    ... $label $i s" -ForegroundColor DarkGray }
    }
    return $false
}

function Start-Server {
    param($dir, $title, $npmArgs)
    $inner = "Set-Location -LiteralPath '$dir'; " +
             "`$host.UI.RawUI.WindowTitle = '$title'; " +
             "npm $npmArgs"
    Start-Process -FilePath 'powershell' -WindowStyle $childStyle -ArgumentList @(
        '-NoExit', '-NoProfile', '-Command', $inner
    )
}

$failed = $false
try {
    # --- 1. backend/.env ---
    Write-Step '1/6  Kiem tra backend/.env'
    $envFile = Join-Path $backendDir '.env'
    if (-not (Test-Path $envFile)) { throw "Thieu $envFile" }
    $envText = Get-Content -LiteralPath $envFile -Raw
    foreach ($key in @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY')) {
        $pattern = '(?m)^\s*' + $key + '\s*=\s*\S'
        if ($envText -notmatch $pattern) { throw "backend/.env thieu $key" }
    }
    Write-Ok 'Day du'

    # --- 2. Doi mang / Supabase ---
    Write-Step '2/6  Doi ket noi mang (Supabase)'
    $net = $false
    for ($i = 1; $i -le 60; $i++) {
        if (Test-Port $supabaseHost 443 3000) { $net = $true; break }
        Start-Sleep -Seconds 2
        if (($i % 5) -eq 0) { Write-Host "    ... $($i * 2) s" -ForegroundColor DarkGray }
    }
    if ($net) {
        Write-Ok 'Ket noi duoc toi Supabase'
    } else {
        Write-Note 'Chua ra duoc Supabase (mang chua len).'
        Write-Note 'Neu app bao loi sau nay: https://supabase.com/dashboard -> project Paused thi Restore.'
        if (-not $Auto) {
            $ans = Read-Host 'Van tiep tuc? (y/N)'
            if ($ans -ne 'y') { throw 'Dung: Supabase chua san sang' }
        } else {
            Write-Note 'Van bat server; backend se tu ket noi lai khi co mang.'
        }
    }

    # --- 3. backend ---
    Write-Step '3/6  Backend NestJS (cong 3000)'
    if (Test-Port 'localhost' $backendPort) {
        Write-Ok 'Da chay san'
    } else {
        Start-Server $backendDir 'CALENDAR backend 3000' 'run start:dev'
        Write-Ok 'Da mo cua so backend'
    }

    # --- 4. doi backend (quan trong nhat) ---
    Write-Step '4/6  Doi backend tra loi'
    if (-not (Wait-Port 'localhost' $backendPort 'backend' 120)) {
        throw 'Backend khong len sau 120 s - xem cua so backend hoac thu muc logs'
    }
    Write-Ok 'Backend san sang'

    # --- 5. frontend ---
    Write-Step '5/6  Frontend Angular (cong 4200)'
    if (Test-Port 'localhost' $frontendPort) {
        Write-Ok 'Da chay san'
    } else {
        Start-Server $frontendDir 'CALENDAR frontend 4200' 'start'
        Write-Ok 'Da mo cua so frontend'
    }

    # --- 6. doi frontend build ---
    Write-Step '6/6  Doi frontend build xong'
    if (-not (Wait-Port 'localhost' $frontendPort 'frontend' 180)) {
        throw 'Frontend khong len sau 180 s - xem cua so frontend hoac thu muc logs'
    }
    Write-Ok 'Frontend san sang'

    if ($OpenBrowser) {
        Start-Process $frontendUrl
        Write-Ok "Da mo $frontendUrl"
    }

    Write-Host "`n=====================================================" -ForegroundColor Green
    Write-Host " XONG. App san sang o $frontendUrl" -ForegroundColor Green
    Write-Host " (tab dang mo san tu truoc: bam Ctrl+Shift+R)" -ForegroundColor Green
    Write-Host "=====================================================`n" -ForegroundColor Green
} catch {
    $failed = $true
    Write-Host "`nLOI: $($_.Exception.Message)" -ForegroundColor Red
    if (-not $Auto) { Read-Host 'Enter de dong' | Out-Null }
}

try { Stop-Transcript | Out-Null } catch { }

# Chi giu 20 log gan nhat
try {
    Get-ChildItem -LiteralPath $logDir -Filter 'start-dev-*.log' |
        Sort-Object LastWriteTime -Descending | Select-Object -Skip 20 |
        Remove-Item -Force -ErrorAction SilentlyContinue
} catch { }

if ($failed) { exit 1 }
