# Azaly LMS

Read the Hybrid Architecture MVP blueprint and PLANS.md before changing scope. Update PLANS.md with commands and actual gate evidence. Keep UI in app, domain logic in src/features, and database code in src/db. Never expose draft content through public queries. Maintain AR/EN parity and explicit LTR code direction. Preserve original HTML as offline reference. Keep lab execution, credentials and gateways outside the LMS.

## Maintaining the handover

Review [CODEX_HANDOFF.md](CODEX_HANDOFF.md) as part of each application or operational change. Update affected architecture, feature ownership, setup, release status, and open items in the same change. Keep detailed commands and verified outcomes in [PLANS.md](PLANS.md), and refresh the handover's release and operating state after a verified release or deployment. Keep credentials and private data out of both files.

## Design and UI work

- Use `ui-ux-pro-max` to plan learner, quiz, lab, and authoring flows. Run `python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py 'online course' --domain product --rtl` from the repository root. Use `--rtl` for style and product searches and `--stack nextjs` for framework guidance. Apply suggestions that fit the current application and task. [UI/UX Pro Max instructions](.agents/skills/ui-ux-pro-max/SKILL.md)
- Use `frontend-design` for visual identity, typography, and public-facing layouts. Use the Azaly LMS name in both locales and reuse `app/icon.svg` for the logo. Isolate the Latin wordmark in Arabic layouts and keep surrounding copy localized. [Frontend Design instructions](.agents/skills/frontend-design/SKILL.md)
- Use `web-design-guidelines` to review changed UI files. Check keyboard navigation, focus, labels, feedback, and overflow. Verify the affected routes in Arabic and English at mobile and desktop widths in both themes. Confirm that the layout mirrors where appropriate and code and terminal text stay LTR. Record the browser checks you ran in `PLANS.md`. [Web Design Guidelines instructions](.agents/skills/web-design-guidelines/SKILL.md)

## Builds and releases

- Set the release version in `package.json`. Both locale footers read that value at build time. Use a patch bump for fixes, a minor bump for features, and a major bump for a breaking release. On a push to `main`, GitHub Actions validates the version and publishes an annotated tag and a GitHub Release when the version is untagged. [Release workflow](.github/workflows/release.yml)
- Before publishing, run `bash infra/verify.sh` and record the observed results in `PLANS.md`. Require the **Foundation checks** `verify` job on the PR. The workflow builds and tests the Docker stack from the pushed revision. [CI workflow](.github/workflows/ci.yml)
- Rebuild the local development stack from the updated checkout with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev`. Check `/api/health`, `/api/ready`, and the version displayed on `/ar` and `/en`. Use the existing Compose project and volume. [Self-hosted deployment instructions](README.md#self-hosted-deployment)

## Autonomous delivery workflow

1. Switch to `main` and run `git pull --ff-only origin main`. Create a dedicated feature branch from that commit and implement the requested scope. Never push directly to `main` or force-push.
2. Run `bash infra/verify.sh` locally and iterate until it exits 0. Never weaken, skip, or delete earlier tests, database permission checks, or security invariants. When a phase adds checks, update the same entrypoint for local use and CI. Record observed commands and results in `PLANS.md`.
3. Commit the reviewed changes, push the feature branch to `origin`, and open a PR with `gh pr create --base main`.
4. Arm auto-merge with `gh pr merge --auto --merge --delete-branch`. If the PR is already `CLEAN` with its required checks passed, use `gh pr merge --merge --delete-branch`. Never use `--admin` or bypass CI rules.
5. Watch `gh pr checks --watch`. If CI fails, inspect `gh run view <run-id> --log-failed`, fix the failure, rerun `bash infra/verify.sh` to exit 0, commit and push the fix, and watch the new checks. Re-arm auto-merge if needed. Stop and report if CI still fails after three fix retries.
6. After CI passes, poll `gh pr view --json state --jq .state` for up to 120 seconds for `MERGED`. If the PR is still unmerged, report the blocker and retain the feature branch.
7. Once merged, switch to `main`, run `git pull --ff-only origin main && git fetch --tags --prune`, and delete the local feature branch with `git branch -d` if it still exists.
8. If the change adds migrations, apply them with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml run --rm --build migrate`. Rebuild with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev`, retaining any active Compose overrides and the `academy-dev_postgres-data` volume.
9. Confirm HTTP 200 from `http://127.0.0.1:3000/api/health` and `http://127.0.0.1:3000/api/ready`. Check the displayed version on `/ar` and `/en`. Confirm the release tag exists on `origin` and the GitHub Release is published. Report the PR URL, merge commit SHA, release tag, and health check results.
