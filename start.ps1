param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThruArgs
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    $pyCmd = $null
    if (Get-Command python -ErrorAction SilentlyContinue) {
        & python --version *> $null
        if ($LASTEXITCODE -eq 0) { $pyCmd = @("python") }
    }
    if (-not $pyCmd -and (Get-Command py -ErrorAction SilentlyContinue)) {
        & py -3 --version *> $null
        if ($LASTEXITCODE -eq 0) { $pyCmd = @("py", "-3") }
    }
    if (-not $pyCmd) {
        Write-Error "Khong tim thay Python 3. Hay chay start.bat hoac cai Python 3.10+."
        exit 1
    }

    if ($pyCmd.Count -gt 1) {
        & $pyCmd[0] $pyCmd[1] "$PSScriptRoot\start_system.py" @PassThruArgs
    } else {
        & $pyCmd[0] "$PSScriptRoot\start_system.py" @PassThruArgs
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
