<!-- docs/dev/git-release-workflow.md documents local git, branch, push, and release workflows for ani2arr maintainers. -->
# Git And Release Workflow

## Workflow Navigator

- [Local commit](#local-commit): use when changes are ready to save in git.
- [Push existing work](#push-existing-work): use when commits should leave your machine.
- [New branch](#new-branch): use before risky, parallel, or multi-task work.
- [Release](#release): use when publishing a normal tagged release.
- [Hotfix](#hotfix): use when shipping a narrow patch release.

## Local Commit

Use local commits when a change is coherent and validated enough to keep.

Windows:

```powershell
git status --short
git diff
cmd.exe /d /s /c "pnpm run lint"
cmd.exe /d /s /c "pnpm run compile"
cmd.exe /d /s /c "pnpm run test"
git add <intended-files>
git status --short
git commit -m "type(scope): concise change"
```

Linux/macOS:

```bash
git status --short
git diff
pnpm run lint
pnpm run compile
pnpm run test
git add <intended-files>
git status --short
git commit -m "type(scope): concise change"
```

Run narrower checks only when the change is tiny and low risk. Run full validation before release prep, larger refactors, dependency changes, workflow changes, or anything that should be CI-ready:

```powershell
cmd.exe /d /s /c "pnpm run validate"
```

```bash
pnpm run validate
```

Stage only intended files. Leave unrelated local files unstaged.

## Push Existing Work

Push when commits are useful outside the local machine:

- review-ready or CI-ready work
- release prep
- a backup point worth preserving remotely
- a branch that another person or machine needs

Avoid pushing broken WIP to `main`. If work is incomplete but worth backing up, push it on a branch.

```powershell
git status --short
git log --oneline --max-count 5
git push origin main
```

## New Branch

Create a branch before work that may need review, rollback, or parallel changes.

Use a branch for:

- risky changes
- public pull requests
- experiments
- multi-task work
- hotfixes
- work that should not block `main`

Small solo-maintainer fixes can land directly on `main` when they are easy to inspect and validate.

```powershell
git switch main
git pull --ff-only
git switch -c short-topic-name
```

## Release

Use one version per release. Keep version strings aligned across `package.json`, `CHANGELOG.md`, README badges, and the git tag.

1. Update `package.json` version to `X.Y.Z`.
2. Add a `CHANGELOG.md` entry for `vX.Y.Z`.
3. Update the README release badge if it names the old version.
4. Run full validation.
5. Commit release prep.
6. Push `main`.
7. Tag the release.
8. Push the tag.
9. Verify the GitHub release, Firefox zip, Chrome zip, and `SHA256SUMS.txt`.

Windows:

```powershell
cmd.exe /d /s /c "pnpm run validate"
git status --short
git add package.json CHANGELOG.md README.md
git commit -m "chore(release): vX.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Linux/macOS:

```bash
pnpm run validate
git status --short
git add package.json CHANGELOG.md README.md
git commit -m "chore(release): vX.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag push starts `.github/workflows/release.yml`. That workflow runs validation, builds Firefox and Chrome zips, writes `.output/SHA256SUMS.txt`, and creates the GitHub release.

## Hotfix

Use hotfixes for narrow fixes that should ship before the next normal release.

```powershell
git switch main
git pull --ff-only
git switch -c hotfix-short-name
```

Fix only the patch issue. Run focused checks while editing, then run full validation before release.

Windows:

```powershell
cmd.exe /d /s /c "pnpm run validate"
git add <intended-files>
git commit -m "fix(scope): concise fix"
git switch main
git merge --ff-only hotfix-short-name
```

Linux/macOS:

```bash
pnpm run validate
git add <intended-files>
git commit -m "fix(scope): concise fix"
git switch main
git merge --ff-only hotfix-short-name
```

Then follow [Release](#release) with the next patch version, such as `v2.1.1`.
