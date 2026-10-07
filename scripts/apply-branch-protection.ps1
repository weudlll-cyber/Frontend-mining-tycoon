<#
File: scripts/apply-branch-protection.ps1
Purpose: Apply the "Protect main" repository ruleset for the default branch.
Role in system:
- Creates or updates a branch ruleset: pull request required (no approvals,
  single-maintainer project), the `CI Summary (Manual Merge Gate)` check must
  pass, and the default branch cannot be force-pushed or deleted.
- Idempotent: an existing ruleset with the same name is updated in place.
Constraints:
- Personal repositories cannot add GitHub Actions as a bypass actor, so no
  workflow may push to the default branch directly (keepalive.yml pushes to
  its own `keepalive` branch instead).
Security notes:
- Reads token from GITHUB_TOKEN only; never prints it.
- Uses GitHub REST API over HTTPS.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  [Parameter(Mandatory = $true)]
  [string]$Repo
)

$token = $env:GITHUB_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'GITHUB_TOKEN is required in the environment.'
}

$headers = @{
  Authorization = "Bearer $token"
  Accept = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
}

$rulesetName = 'Protect main'
$rulesetsUri = "https://api.github.com/repos/$Owner/$Repo/rulesets"

$rulesetBody = @{
  name = $rulesetName
  target = 'branch'
  enforcement = 'active'
  conditions = @{ ref_name = @{ include = @('~DEFAULT_BRANCH'); exclude = @() } }
  bypass_actors = @()
  rules = @(
    @{ type = 'deletion' },
    @{ type = 'non_fast_forward' },
    @{
      type = 'pull_request'
      parameters = @{
        required_approving_review_count = 0
        dismiss_stale_reviews_on_push = $false
        require_code_owner_review = $false
        require_last_push_approval = $false
        required_review_thread_resolution = $false
      }
    },
    @{
      type = 'required_status_checks'
      parameters = @{
        strict_required_status_checks_policy = $false
        required_status_checks = @(@{ context = 'CI Summary (Manual Merge Gate)' })
      }
    }
  )
} | ConvertTo-Json -Depth 10

$existing = Invoke-RestMethod -Method Get -Uri $rulesetsUri -Headers $headers |
  Where-Object { $_.name -eq $rulesetName } |
  Select-Object -First 1

if ($existing) {
  Write-Host "Updating ruleset '$rulesetName' (id $($existing.id)) for $Owner/$Repo..."
  Invoke-RestMethod -Method Put -Uri "$rulesetsUri/$($existing.id)" -Headers $headers -ContentType 'application/json' -Body $rulesetBody | Out-Null
} else {
  Write-Host "Creating ruleset '$rulesetName' for $Owner/$Repo..."
  Invoke-RestMethod -Method Post -Uri $rulesetsUri -Headers $headers -ContentType 'application/json' -Body $rulesetBody | Out-Null
}

Write-Host ''
Write-Host 'Applied ruleset:'
Write-Host '- Pull request required before merge (no approvals required)'
Write-Host "- Required check: CI Summary (Manual Merge Gate)"
Write-Host '- Force pushes and branch deletion blocked'
Write-Host '- No bypass actors'
