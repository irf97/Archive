param(
  [int]$Count = 100,
  [string]$ApiBase = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"

function Wait-Health {
  param([string]$BaseUrl)
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $null = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 5
      return
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  throw "Local API did not come up at $BaseUrl"
}

function Start-BackendIfNeeded {
  param([string]$BaseUrl, [string]$WorkDir)
  try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/health" -TimeoutSec 5
    return
  } catch {}
  Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "server.mjs" -WorkingDirectory $WorkDir | Out-Null
  Wait-Health -BaseUrl $BaseUrl
}

function Get-CodexScriptPath {
  if ($env:CODEX_SCRIPT_PATH -and (Test-Path $env:CODEX_SCRIPT_PATH)) {
    return $env:CODEX_SCRIPT_PATH
  }
  $fallback = Join-Path $env:APPDATA "npm\codex.ps1"
  if (Test-Path $fallback) {
    return $fallback
  }
  throw "codex.ps1 not found. Set CODEX_SCRIPT_PATH or install the Codex CLI."
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body = $null
  )
  $params = @{
    Uri = $Uri
    Method = $Method
    ContentType = "application/json"
    TimeoutSec = 600
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 40)
  }
  Invoke-RestMethod @params
}

function Invoke-CodexStructured {
  param(
    [string]$CodexScriptPath,
    [string]$PromptPath,
    [string]$SchemaPath,
    [string]$OutputPath,
    [string]$StdoutPath,
    [string]$StderrPath
  )
  $basedir = Split-Path $CodexScriptPath -Parent
  $node = Join-Path $basedir "node.exe"
  if (-not (Test-Path $node)) {
    $node = "node.exe"
  }
  $codexJs = Join-Path $basedir "node_modules\@openai\codex\bin\codex.js"
  if (-not (Test-Path $codexJs)) {
    throw "Codex entrypoint not found at $codexJs"
  }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $node
  $psi.Arguments = "`"$codexJs`" exec --model gpt-5.4-mini --skip-git-repo-check --output-schema `"$SchemaPath`" --output-last-message `"$OutputPath`" -"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $proc = [System.Diagnostics.Process]::Start($psi)
  $prompt = Get-Content -Raw $PromptPath
  $proc.StandardInput.Write($prompt)
  $proc.StandardInput.Close()
  $stdout = $proc.StandardOutput.ReadToEnd()
  $stderr = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()

  [System.IO.File]::WriteAllText($StdoutPath, $stdout, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($StderrPath, $stderr, [System.Text.UTF8Encoding]::new($false))
  return $proc.ExitCode
}

function New-NichePrompt {
  param(
    [int]$Index,
    [int]$Total,
    [string]$Niche
  )
  @"
You are generating one biotech R&D crawl packet for item $Index of $Total.

Target niche: $Niche

Rules:
- Return only JSON.
- Find 1 to 4 public experts for the niche.
- If the niche is weak or overfitted, stay in the same area but shift to a neighboring subtopic.
- Use public knowledge only.
- Prefer current, active, technically relevant experts.
- Keep the seek specific and the experts distinct.

Output shape:
{
  "seek": {
    "use_case": "short decision question",
    "domain": "short biotech niche",
    "geography": "global or a specific region",
    "expert_depth": "scientist | founder | VP R&D | platform engineer | translational lead | process development",
    "exclusion": ["current employees", "MNPI / confidential info"],
    "tags": ["logical topic tags"],
    "tag_groups": {
      "topic": ["topic tags"],
      "method": ["method tags"],
      "domain": ["domain tags"],
      "geo": ["geo tags"],
      "institution": ["institution tags"],
      "archetype": ["role tags"],
      "compliance": ["boundary tags"],
      "source": ["public profile", "paper", "conference", "patent", "web"]
    },
    "output": "catalog",
    "max_experts": 4
  },
  "experts": [
    {
      "name": "real public expert name",
      "cancer_type": "biotech niche label for compatibility",
      "domain": "concise domain label",
      "geography": "concise geography label",
      "institution": "concise public affiliation if known",
      "archetype": "scientist | founder | VP R&D | platform engineer | translational lead | process development lead | CMC leader | bioinformatician | product scientist",
      "tag_groups": {
        "topic": ["topic tags"],
        "method": ["method tags"],
        "domain": ["domain tags"],
        "geo": ["geo tags"],
        "institution": ["institution tags"],
        "archetype": ["role tags"],
        "compliance": ["boundary tags"],
        "source": ["public profile", "paper", "conference", "patent", "web"]
      },
      "tags": ["flat union of the tag_groups values"],
      "evidence_links": ["1-3 public URLs"],
      "likely_network": "Direct",
      "contact_route": "concise public route",
      "thesis_fit": "one line",
      "niche": "one line",
      "approach": "one line",
      "query_terms": ["searchable", "terms"],
      "questions_to_ask": ["2-4 short questions"],
      "compliance_flags": "short boundary text",
      "call_value_estimate": 300,
      "scores": {
        "relevance": 0,
        "recency": 0,
        "decision_proximity": 0,
        "independence": 0,
        "accessibility": 0,
        "risk": 0
      }
    }
  ]
}
"@
}

function New-ItemSchema {
  @"
{
  "type": "object",
  "additionalProperties": false,
  "required": ["seek", "experts"],
  "properties": {
    "seek": {
      "type": "object",
      "additionalProperties": false,
      "required": ["use_case", "domain", "geography", "expert_depth", "exclusion", "tags", "tag_groups", "output", "max_experts"],
      "properties": {
        "use_case": { "type": "string" },
        "domain": { "type": "string" },
        "geography": { "type": "string" },
        "expert_depth": { "type": "string" },
        "exclusion": { "type": "array", "items": { "type": "string" } },
        "tags": { "type": "array", "items": { "type": "string" } },
        "tag_groups": {
          "type": "object",
          "additionalProperties": false,
          "required": ["topic", "method", "domain", "geo", "institution", "archetype", "compliance", "source"],
          "properties": {
            "topic": { "type": "array", "items": { "type": "string" } },
            "method": { "type": "array", "items": { "type": "string" } },
            "domain": { "type": "array", "items": { "type": "string" } },
            "geo": { "type": "array", "items": { "type": "string" } },
            "institution": { "type": "array", "items": { "type": "string" } },
            "archetype": { "type": "array", "items": { "type": "string" } },
            "compliance": { "type": "array", "items": { "type": "string" } },
            "source": { "type": "array", "items": { "type": "string" } }
          }
        },
        "output": { "type": "string" },
        "max_experts": { "type": "number" }
      }
    },
    "experts": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "name", "cancer_type", "domain", "geography", "institution", "archetype",
          "tag_groups", "tags", "evidence_links", "likely_network", "contact_route",
          "thesis_fit", "niche", "approach", "query_terms", "questions_to_ask",
          "compliance_flags", "call_value_estimate", "scores"
        ],
        "properties": {
          "name": { "type": "string" },
          "cancer_type": { "type": "string" },
          "domain": { "type": "string" },
          "geography": { "type": "string" },
          "institution": { "type": "string" },
          "archetype": { "type": "string" },
          "tag_groups": {
            "type": "object",
            "additionalProperties": false,
            "required": ["topic", "method", "domain", "geo", "institution", "archetype", "compliance", "source"],
            "properties": {
              "topic": { "type": "array", "items": { "type": "string" } },
              "method": { "type": "array", "items": { "type": "string" } },
              "domain": { "type": "array", "items": { "type": "string" } },
              "geo": { "type": "array", "items": { "type": "string" } },
              "institution": { "type": "array", "items": { "type": "string" } },
              "archetype": { "type": "array", "items": { "type": "string" } },
              "compliance": { "type": "array", "items": { "type": "string" } },
              "source": { "type": "array", "items": { "type": "string" } }
            }
          },
          "tags": { "type": "array", "items": { "type": "string" } },
          "evidence_links": { "type": "array", "items": { "type": "string" } },
          "likely_network": { "type": "string" },
          "contact_route": { "type": "string" },
          "thesis_fit": { "type": "string" },
          "niche": { "type": "string" },
          "approach": { "type": "string" },
          "query_terms": { "type": "array", "items": { "type": "string" } },
          "questions_to_ask": { "type": "array", "items": { "type": "string" } },
          "compliance_flags": { "type": "string" },
          "call_value_estimate": { "type": "number" },
          "scores": {
            "type": "object",
            "additionalProperties": false,
            "required": ["relevance", "recency", "decision_proximity", "independence", "accessibility", "risk"],
            "properties": {
              "relevance": { "type": "number" },
              "recency": { "type": "number" },
              "decision_proximity": { "type": "number" },
              "independence": { "type": "number" },
              "accessibility": { "type": "number" },
              "risk": { "type": "number" }
            }
          }
        }
      }
    }
  }
}
"@
}

function Get-BiotechNiches {
  @(
    "cell therapy manufacturing",
    "CAR-T persistence and exhaustion",
    "in vivo CAR editing",
    "gene editing delivery",
    "base editing therapeutics",
    "prime editing therapeutics",
    "CRISPR screening platforms",
    "siRNA delivery",
    "ASO chemistry",
    "mRNA and LNP formulation",
    "lipid nanoparticle engineering",
    "protein design",
    "de novo enzyme design",
    "AI drug discovery",
    "spatial transcriptomics",
    "single-cell multiomics",
    "organoid screening",
    "microbiome engineering",
    "synthetic biology chassis",
    "cell-free expression systems",
    "biomanufacturing process development",
    "continuous manufacturing",
    "ADC linker and payload chemistry",
    "bispecific antibodies",
    "radiopharmaceuticals",
    "diagnostic assay development",
    "automation and lab robotics",
    "platform biology",
    "target discovery",
    "translational biomarkers",
    "companion diagnostics",
    "digital pathology AI",
    "neurodegeneration therapeutics",
    "immunology therapeutics",
    "autoimmune biologics",
    "metabolic disease platforms",
    "rare disease gene therapy",
    "tissue engineering",
    "regenerative medicine",
    "stem cell differentiation",
    "organ-on-chip systems",
    "fermentation strain engineering",
    "scale-up and tech transfer",
    "cell line engineering",
    "bioinformatics platform engineering",
    "high-throughput screening automation",
    "assay miniaturization",
    "precision fermentation",
    "antibody discovery",
    "computational biology platforms",
    "clinical biomarker strategy",
    "oligo therapeutics",
    "protein degradation therapeutics",
    "epigenetic drug discovery",
    "drug delivery systems",
    "gene regulation therapeutics",
    "spatial proteomics",
    "multi-omics data integration",
    "single-cell assay development",
    "manufacturing analytics",
    "quality control analytics",
    "translational CMC"
  )
}

function Get-RandomNiche {
  param(
    [string[]]$Niches,
    [System.Collections.Generic.HashSet[string]]$Used
  )
  $remaining = @($Niches | Where-Object { -not $Used.Contains($_) })
  if ($remaining.Count -eq 0) {
    $remaining = $Niches
  }
  return ($remaining | Get-Random)
}

$root = "C:\AI\Projects\ENS Navigator"
Start-BackendIfNeeded -BaseUrl $ApiBase -WorkDir $root

$codex = Get-CodexScriptPath
$niches = Get-BiotechNiches
$usedNiches = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("ens-biotech-seed-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $temp | Out-Null
$promptPath = Join-Path $temp "prompt.txt"
$schemaPath = Join-Path $temp "schema.json"
$outputPath = Join-Path $temp "output.json"
$stderrPath = Join-Path $temp "codex.stderr.txt"
$stdoutPath = Join-Path $temp "codex.stdout.txt"

$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($schemaPath, (New-ItemSchema), $utf8NoBom)

Write-Host "Generating $Count biotech R&D query items via local Codex..."
$ingested = 0
$jobs = 0
$failed = 0

for ($i = 1; $i -le $Count; $i++) {
  $niche = Get-RandomNiche -Niches $niches -Used $usedNiches
  $null = $usedNiches.Add($niche)
  [System.IO.File]::WriteAllText($promptPath, (New-NichePrompt -Index $i -Total $Count -Niche $niche), $utf8NoBom)

  Remove-Item -LiteralPath $outputPath, $stderrPath, $stdoutPath -ErrorAction SilentlyContinue

  $exitCode = Invoke-CodexStructured -CodexScriptPath $codex -PromptPath $promptPath -SchemaPath $schemaPath -OutputPath $outputPath -StdoutPath $stdoutPath -StderrPath $stderrPath

  if ($exitCode -ne 0 -or -not (Test-Path $outputPath)) {
    $stderr = if (Test-Path $stderrPath) { Get-Content -Raw $stderrPath } else { "" }
    Write-Warning "Codex failed for item $i / $Count on niche '$niche'. $stderr"
    $failed++
    continue
  }

  try {
    $raw = Get-Content -Raw $outputPath
    $item = $raw | ConvertFrom-Json
    if (-not $item.seek -or -not $item.experts) {
      throw "Codex did not return a valid seek/experts payload."
    }

    $job = Invoke-Json -Method Post -Uri "$ApiBase/api/crawl" -Body @{ seek = $item.seek }
    $jobs++
    $payload = @{
      crawl_job_id = $job.id
      experts = @($item.experts)
    }
    $null = Invoke-Json -Method Post -Uri "$ApiBase/api/experts" -Body $payload
    $ingested += @($item.experts).Count
  } catch {
    Write-Warning "Item $i / $Count on niche '$niche' could not be ingested: $($_.Exception.Message)"
    $failed++
  }
}

Write-Host "Done. Logged $jobs crawl jobs, ingested $ingested biotech R&D experts, and skipped $failed items."
