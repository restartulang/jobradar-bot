[CmdletBinding()]
param([ValidateSet('panel','status','install','uninstall')][string]$Action = 'panel')

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$taskName = 'JobRadar Worker'
$entry = Join-Path $root 'src\index.ts'
$arguments = '--env-file=.env --import tsx "' + $entry + '"'

function Read-Worker {
    $path = Join-Path $root 'data\worker.json'
    if (!(Test-Path -LiteralPath $path)) {
        return @{ State = 'BELUM TERDETEKSI'; Detail = 'Belum ada laporan worker.' }
    }
    try {
        $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        $started = [DateTimeOffset]::Parse($record.startedAt)
        $last = [DateTimeOffset]::Parse($record.updatedAt)
        $worker = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
        $same = $worker -and $worker.ProcessName -eq 'node' -and
            [Math]::Abs(($worker.StartTime.ToUniversalTime() - $started.UtcDateTime).TotalSeconds) -le 4
        $age = ([DateTimeOffset]::UtcNow - $last).TotalSeconds
        $state = if (!$same -or $record.phase -eq 'stopped') { 'BERHENTI' }
            elseif ($age -gt 20) { 'TIDAK MERESPONS' }
            elseif ($record.phase -eq 'ready') { 'AKTIF' }
            else { 'MEMULAI' }
        return @{State=$state; Detail=('PID {0} | Mulai {1} | Pembaruan {2}' -f $record.pid,
            $started.LocalDateTime.ToString('dd/MM HH:mm:ss'), $last.LocalDateTime.ToString('HH:mm:ss'))}
    } catch {
        return @{State='BELUM TERKONFIRMASI'; Detail='Laporan worker belum dapat dibaca.'}
    }
}

function Get-RadarTask {
    Get-ScheduledTask -TaskPath '\' -ErrorAction Stop | Where-Object TaskName -eq $taskName
}

function Assert-ProjectTask($task) {
    if ($task -and ($task.Actions.Count -ne 1 -or $task.Actions[0].WorkingDirectory -ne $root -or
        $task.Actions[0].Arguments -ne $arguments)) {
        throw 'Nama task JobRadar sudah digunakan oleh instalasi lain. Periksa Task Scheduler.'
    }
}

function Show-Status {
    $status = Read-Worker
    $schedule = 'Belum terpasang'
    $detail = ''
    try {
        $task = Get-RadarTask
        Assert-ProjectTask $task
        if ($task) {
            $schedule = if ($task.State -eq 'Disabled') { 'Nonaktif' } else { 'Terpasang' }
            $info = Get-ScheduledTaskInfo -InputObject $task
            $detail = ' | Task: ' + $task.State + ' | Kode terakhir: ' + $info.LastTaskResult
        }
    } catch { $schedule = 'Tidak dapat diperiksa'; $detail = ' | ' + $_.Exception.Message }
    Write-Host 'JobRadar | Monitor Windows' -ForegroundColor Cyan
    Write-Host ''
    Write-Host ('Worker    ' + $status.State) -ForegroundColor $(if ($status.State -eq 'AKTIF') {'Green'} else {'Yellow'})
    Write-Host ('          ' + $status.Detail)
    Write-Host ('Autostart ' + $schedule + $detail)
}

if ($Action -eq 'status') { Show-Status; return }
if ($Action -eq 'panel') {
    do {
        if (![Console]::IsOutputRedirected) { Clear-Host }
        Show-Status
        if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { break }
        Write-Host "`nMemperbarui tiap 5 detik. Tekan Q untuk keluar."
        for ($i=0; $i -lt 20; $i++) {
            if ([Console]::KeyAvailable -and [Console]::ReadKey($true).Key -eq 'Q') { return }
            Start-Sleep -Milliseconds 250
        }
    } while ($true)
    return
}

if ($Action -eq 'install') {
    if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) { throw 'Buat .env dari .env.example dan isi kredensial Telegram terlebih dahulu.' }
    $node = (Get-Command node.exe -CommandType Application).Source
    Push-Location -LiteralPath $root
    try {
        & $node --env-file=.env --import tsx scripts/preflight.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Periksa .env dan pastikan npm.cmd install berhasil di folder proyek.' }
    } finally { Pop-Location }
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = [Security.Principal.WindowsPrincipal]::new($identity)
if (!$admin.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Buka PowerShell sebagai Administrator untuk memasang atau menghapus task saat boot.'
}
$existing = Get-RadarTask
Assert-ProjectTask $existing
if ($Action -eq 'uninstall') {
    if ($existing) {
        Stop-ScheduledTask -InputObject $existing
        Unregister-ScheduledTask -InputObject $existing -Confirm:$false
    }
    Write-Host 'Autostart JobRadar dilepas.'
    return
}
if ((Read-Worker).State -in @('AKTIF','MEMULAI','TIDAK MERESPONS') -and (!$existing -or $existing.State -ne 'Running')) {
    throw 'Worker manual masih berjalan. Hentikan dengan Ctrl+C sebelum memasang autostart.'
}
if (!$existing) {
    $run = New-ScheduledTaskAction -Execute $node -Argument $arguments -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType S4U -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $run -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
} elseif ($existing.State -eq 'Disabled') {
    Enable-ScheduledTask -InputObject $existing | Out-Null
}
if (!$existing -or $existing.State -ne 'Running') { Start-ScheduledTask -TaskPath '\' -TaskName $taskName }
Write-Host 'Autostart terpasang. Panel akan menampilkan AKTIF setelah bot selesai memulai.'
Show-Status
