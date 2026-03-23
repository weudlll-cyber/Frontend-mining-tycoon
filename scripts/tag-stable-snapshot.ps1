<#
File: scripts/tag-stable-snapshot.ps1
Purpose: Create the stable rollback tag after a manual merge completes.
Role in system:
- Provides a deterministic post-merge tagging step for frontend or backend repos.
- Keeps tagging explicit and human-controlled after branch protection + manual squash merge.
Constraints:
- Expects the target branch to already contain the merged commit.
- Reuses the exact stable tag name requested by the workflow contract.
Security notes:
- No credentials are read here; git remote auth must already be configured.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath,

  [string]$Branch = 'main'
)

Push-Location $RepoPath
try {
  git checkout $Branch
  git pull origin $Branch
  git tag -a snapshot-stable-v1 -m "Stable snapshot after full hygiene, tooltip parity, layout stabilization, and documentation sync."
  git push origin snapshot-stable-v1
}
finally {
  Pop-Location
}
