#requires -Version 7.0

[CmdletBinding()]
param(
    [string]$TemplateRoot = $env:ZG_JOURNAL_TEMPLATE_ROOT,
    [switch]$RefreshLogo,
    [switch]$LogoOnly,
    [switch]$KeepXeLaTeXLog
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = $PSScriptRoot
$inputMarkdown = "QA-Test-Assignment-RU.md"
$outputName = "QA-Test-Assignment-RU"
$authorsConfig = Join-Path $scriptRoot "authors.yml"
$brandConfig = Join-Path $scriptRoot "brand.yml"
$brandAssetsDir = Join-Path $scriptRoot "brand\assets"
$logoPath = Join-Path $brandAssetsDir "logo.png"
$logoUrl = "https://tapclap.com/img/logo.png"

function Resolve-ZgTemplateRoot {
    param([string]$ExplicitTemplateRoot)

    # Explicit override has the highest priority.
    if (-not [string]::IsNullOrWhiteSpace($ExplicitTemplateRoot)) {
        $explicitPath = [System.IO.Path]::GetFullPath(
            (Join-Path $scriptRoot $ExplicitTemplateRoot)
        )

        $explicitBuilder = Join-Path `
            $explicitPath `
            "utilities\journal-builder\builder.ps1"

        if (Test-Path -LiteralPath $explicitBuilder -PathType Leaf) {
            return (Resolve-Path -LiteralPath $explicitPath).Path
        }

        throw "ZG Journal Template builder was not found under explicit TemplateRoot: $explicitPath"
    }

    # Find the actual Git repository root.
    $repoRoot = (& git -C $scriptRoot rev-parse --show-toplevel).Trim()

    if ([string]::IsNullOrWhiteSpace($repoRoot)) {
        throw "Unable to determine Git repository root."
    }

    $gitmodules = Join-Path $repoRoot ".gitmodules"

    if (-not (Test-Path -LiteralPath $gitmodules -PathType Leaf)) {
        throw ".gitmodules was not found in repository root: $repoRoot"
    }

    # Find the registered zg-journal-template submodule path.
    $entries = & git config -f $gitmodules `
        --get-regexp '^submodule\..*\.path$'

    $submoduleRelativePath = $null

    foreach ($entry in $entries) {
        if ($entry -match '^\S+\s+(.+)$') {
            $candidate = $Matches[1].Trim()

            if ($candidate -match 'zg-journal-template') {
                $submoduleRelativePath = $candidate
                break
            }
        }
    }

    if ([string]::IsNullOrWhiteSpace($submoduleRelativePath)) {
        throw "zg-journal-template submodule is not registered in .gitmodules."
    }

    $submodulePath = [System.IO.Path]::GetFullPath(
        (Join-Path $repoRoot $submoduleRelativePath)
    )

    $builderPath = Join-Path `
        $submodulePath `
        "utilities\journal-builder\builder.ps1"

    if (-not (Test-Path -LiteralPath $builderPath -PathType Leaf)) {
        throw @"
ZG Journal Template submodule is registered, but its builder was not found.

Repository root:
  $repoRoot

Registered submodule:
  $submoduleRelativePath

Resolved path:
  $submodulePath

Expected builder:
  $builderPath

If necessary, initialize submodules:
  git submodule update --init --recursive
"@
    }

    return (Resolve-Path -LiteralPath $submodulePath).Path
}

function Test-PngFile {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    $file = Get-Item -LiteralPath $Path
    if ($file.Length -lt 512) {
        return $false
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $signature = @(137, 80, 78, 71, 13, 10, 26, 10)

    if ($bytes.Length -lt $signature.Count) {
        return $false
    }

    for ($i = 0; $i -lt $signature.Count; $i++) {
        if ($bytes[$i] -ne $signature[$i]) {
            return $false
        }
    }

    return $true
}

function Ensure-TapclapLogo {
    [void](New-Item -ItemType Directory -Force -Path $brandAssetsDir)

    if (-not $RefreshLogo -and (Test-PngFile -Path $logoPath)) {
        Write-Host "TAPCLAP logo: $logoPath"
        return
    }

    $temporaryLogo = "$logoPath.download"
    Remove-Item -LiteralPath $temporaryLogo -Force -ErrorAction SilentlyContinue

    Write-Host "Downloading TAPCLAP logo from: $logoUrl"
    Invoke-WebRequest -Uri $logoUrl -OutFile $temporaryLogo

    if (-not (Test-PngFile -Path $temporaryLogo)) {
        Remove-Item -LiteralPath $temporaryLogo -Force -ErrorAction SilentlyContinue
        throw "Downloaded TAPCLAP logo is not a valid PNG: $logoUrl"
    }

    Move-Item -LiteralPath $temporaryLogo -Destination $logoPath -Force
    Write-Host "TAPCLAP logo saved: $logoPath"
}

foreach ($requiredFile in @(
    (Join-Path $scriptRoot $inputMarkdown),
    $authorsConfig,
    $brandConfig
)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required package file is missing: $requiredFile"
    }
}

Ensure-TapclapLogo

if ($LogoOnly) {
    Write-Host "Logo-only mode completed: $logoPath" -ForegroundColor Green
    return
}

$resolvedTemplateRoot = Resolve-ZgTemplateRoot -ExplicitTemplateRoot $TemplateRoot
$builderPath = Join-Path $resolvedTemplateRoot "utilities\journal-builder\builder.ps1"

$builderArguments = @{
    InputMd       = $inputMarkdown
    OutputName    = $outputName
    IssueDir      = $scriptRoot
    TemplateRoot  = $resolvedTemplateRoot
    BrandConfig   = $brandConfig
    BrandAssetsDir = $brandAssetsDir
    AuthorsConfig = $authorsConfig
    LogFileName   = "build.log"
}

if ($KeepXeLaTeXLog) {
    $builderArguments.KeepXeLaTeXLog = $true
}

Write-Host "Issue directory: $scriptRoot"
Write-Host "ZG Journal Template: $resolvedTemplateRoot"
Write-Host "Brand config: $brandConfig"
Write-Host "Brand assets: $brandAssetsDir"
Write-Host "Authors config: $authorsConfig"
Write-Host "Output: $(Join-Path $scriptRoot "$outputName.pdf")"
Write-Host ""

& $builderPath @builderArguments

$pdfPath = Join-Path $scriptRoot "$outputName.pdf"
if (-not (Test-Path -LiteralPath $pdfPath -PathType Leaf)) {
    throw "Builder finished without the expected PDF: $pdfPath"
}

Write-Host ""
Write-Host "Completed: $pdfPath" -ForegroundColor Green
