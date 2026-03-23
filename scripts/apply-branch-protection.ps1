<#
File: scripts/apply-branch-protection.ps1
Purpose: Apply GitHub repository merge-safety settings for manual-final-approval workflow.
Role in system:
- Configures repository merge settings (squash-only, auto-merge off) and branch protection.
- Requires an authenticated GitHub token with repo administration permissions.
Constraints:
- Keeps merge finalization manual: PR approval + explicit Squash & Merge click in GitHub UI.
- Enforces required status checks that are produced by .github/workflows/ci.yml.
Security notes:
- Reads token from GITHUB_TOKEN only; never prints it.
- Uses GitHub REST API over HTTPS.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  [Parameter(Mandatory = $true)]
  [string]$Repo,

  [Parameter(Mandatory = $true)]
  [string]$Branch
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

$repoUri = "https://api.github.com/repos/$Owner/$Repo"
$branchProtectionUri = "$repoUri/branches/$Branch/protection"
$enforceAdminsUri = "$repoUri/branches/$Branch/protection/enforce_admins"

Write-Host "Configuring repository merge settings for $Owner/$Repo..."
$repoBody = @{
  allow_squash_merge = $true
  allow_merge_commit = $false
  allow_rebase_merge = $false
  allow_auto_merge = $false
  delete_branch_on_merge = $false
} | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri $repoUri -Headers $headers -ContentType 'application/json' -Body $repoBody | Out-Null

Write-Host "Configuring branch protection for $Branch..."
$protectionBody = @{
  required_status_checks = @{
    strict = $true
    contexts = @(
      'Lint',
      'Format check',
      'Unit tests',
      'Test coverage',
      'Build',
      'Security audit',
      'CI Summary (Manual Merge Gate)'
    )
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
    require_last_push_approval = $false
    bypass_pull_request_allowances = @{
      users = @()
      teams = @()
      apps = @()
    }
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $false
} | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Put -Uri $branchProtectionUri -Headers $headers -ContentType 'application/json' -Body $protectionBody | Out-Null
Invoke-RestMethod -Method Post -Uri $enforceAdminsUri -Headers $headers | Out-Null

Write-Host ''
Write-Host 'Applied configuration:'
Write-Host '- Pull request required before merge'
Write-Host '- At least 1 approval required'
Write-Host '- Force pushes blocked'
Write-Host '- Admin bypass disabled via enforce_admins'
Write-Host '- Required checks enforced'
Write-Host '- Linear history required'
Write-Host '- Auto-merge disabled'
Write-Host '- Squash merge allowed; merge-commit/rebase merge disabled'
