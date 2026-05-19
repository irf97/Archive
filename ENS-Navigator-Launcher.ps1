$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\AI\Projects\ENS Navigator"
$Port = 8787
$ApiBase = "http://127.0.0.1:$Port"

function Test-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-EnsServer {
  if (Test-PortListening -Port $Port) {
    Write-Host "ENS Navigator already listening on $ApiBase"
    return
  }

  $node = (Get-Command node).Source
  $env:PORT = "$Port"
  Start-Process -FilePath $node -ArgumentList @("server.mjs") -WorkingDirectory $ProjectRoot -WindowStyle Hidden | Out-Null

  for ($i = 0; $i -lt 40; $i++) {
    try {
      Invoke-RestMethod -Uri "$ApiBase/api/health" -TimeoutSec 1 | Out-Null
      Write-Host "ENS Navigator started at $ApiBase"
      return
    } catch {
      Start-Sleep -Milliseconds 150
    }
  }

  throw "Server did not become ready on $ApiBase"
}

function Invoke-EnsJson {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null
  )

  $params = @{
    Uri = "$ApiBase$Path"
    Method = $Method
    TimeoutSec = 300
  }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 16)
  }
  Invoke-RestMethod @params
}

function ens-health { Invoke-EnsJson GET "/api/health" }
function ens-experts {
  param([string]$q = "", [string]$cancerType = "all")
  $path = "/api/experts"
  $parts = @()
  if ($q) { $parts += "q=$([uri]::EscapeDataString($q))" }
  if ($cancerType -and $cancerType -ne "all") { $parts += "cancerType=$([uri]::EscapeDataString($cancerType))" }
  if ($parts.Count) { $path += "?" + ($parts -join "&") }
  Invoke-EnsJson GET $path
}
function ens-crawl {
  param([Parameter(Mandatory = $true)][string]$UseCase, [Parameter(Mandatory = $true)][string]$Domain)
  $body = @{
    seek = @{
      use_case = $UseCase
      domain = $Domain
      geography = "global"
      expert_depth = "researcher | medical oncologist | urologic oncologist"
      exclusion = @("current employees", "MNPI / confidential info")
      output = "catalog"
      max_experts = 12
    }
  }
  Invoke-EnsJson POST "/api/crawl" $body
}
function ens-crawl-ingest {
  param([Parameter(Mandatory = $true)][string]$UseCase, [Parameter(Mandatory = $true)][string]$Domain)
  $body = @{
    seek = @{
      use_case = $UseCase
      domain = $Domain
      geography = "global"
      expert_depth = "researcher | medical oncologist | urologic oncologist"
      exclusion = @("current employees", "MNPI / confidential info")
      output = "catalog"
      max_experts = 12
    }
  }
  Invoke-EnsJson POST "/api/crawl-and-ingest" $body
}
function ens-jobs { Invoke-EnsJson GET "/api/crawl" }
function ens-sync { Invoke-EnsJson GET "/api/experts" | Out-Null; Write-Host "Synced from local DB." }
function ens-open-ui { Start-Process "$ApiBase" }

Start-EnsServer
Set-Location $ProjectRoot

Write-Host ""
Write-Host "Commands:"
Write-Host "  ens-health"
Write-Host "  ens-experts -q 'RPLND'"
Write-Host "  ens-crawl -UseCase 'Find experts on ...' -Domain '...'"
Write-Host "  ens-crawl-ingest -UseCase 'Find experts on ...' -Domain '...'"
Write-Host "  ens-jobs"
Write-Host "  ens-sync"
Write-Host "  ens-open-ui"
Write-Host ""
Write-Host "Local data lives in:"
Write-Host "  $ProjectRoot\data"
Write-Host ""

if ($Host.Name -notlike "*Visual Studio Code*") {
  try {
    while ($true) {
      $line = Read-Host "ENS"
      if ($line -in @("exit","quit")) { break }
      if ($line) { Invoke-Expression $line }
    }
  } finally {
    Write-Host "Leaving launcher."
  }
}
