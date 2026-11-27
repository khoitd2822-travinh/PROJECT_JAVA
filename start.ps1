param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThruArgs
)

$ErrorActionPreference = "Stop"
Push-Location $PSScriptRoot
try {
    python "$PSScriptRoot\start_system.py" @PassThruArgs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
