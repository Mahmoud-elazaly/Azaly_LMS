# Azaly LMS

Read the Hybrid Architecture MVP blueprint and PLANS.md before changing scope. Update PLANS.md with commands and actual gate evidence. Keep UI in app, domain logic in src/features, and database code in src/db. Never expose draft content through public queries. Maintain AR/EN parity and explicit LTR code direction. Preserve original HTML as offline reference. Keep lab execution, credentials and gateways outside the LMS.

## Design and UI work

- Use `ui-ux-pro-max` to plan learner, quiz, lab, and authoring flows. Run `python3 -B .agents/skills/ui-ux-pro-max/scripts/search.py 'online course' --domain product --rtl` from the repository root. Use `--rtl` for style and product searches and `--stack nextjs` for framework guidance. Apply suggestions that fit the current application and task. [UI/UX Pro Max instructions](.agents/skills/ui-ux-pro-max/SKILL.md)
- Use `frontend-design` for visual identity, typography, and public-facing layouts. Use the Azaly LMS name in both locales and reuse `app/icon.svg` for the logo. Isolate the Latin wordmark in Arabic layouts and keep surrounding copy localized. [Frontend Design instructions](.agents/skills/frontend-design/SKILL.md)
- Use `web-design-guidelines` to review changed UI files. Check keyboard navigation, focus, labels, feedback, and overflow. Verify the affected routes in Arabic and English at mobile and desktop widths in both themes. Confirm that the layout mirrors where appropriate and code and terminal text stay LTR. Record the browser checks you ran in `PLANS.md`. [Web Design Guidelines instructions](.agents/skills/web-design-guidelines/SKILL.md)

## Builds and releases

- Set the release version in `package.json`. Both locale footers read that value at build time. Use a patch bump for fixes, a minor bump for features, and a major bump for a breaking release. With explicit operator approval, tag the release commit `v<version>` and push the tag.
- Before publishing, run `bash infra/verify.sh` and record the observed results in `PLANS.md`. Check GitHub Actions **Foundation checks** for the release commit. The workflow builds and tests the Docker stack from the pushed revision. [GitHub workflow](.github/workflows/ci.yml)
- Rebuild the local development stack from the updated checkout with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev`. Check `/api/health`, `/api/ready`, and the version displayed on `/ar` and `/en`. Use the existing Compose project and volume. [Self-hosted deployment instructions](README.md#self-hosted-deployment)

## Autonomous delivery workflow

- Always work on a dedicated feature branch, such as `feat/<scope>` or `fix/<scope>`. Never push directly to `main` or force-push. Create release tags only with explicit operator approval.
- When a new phase adds verification gates, update `infra/verify.sh` to invoke the new full platform gate. Use that entrypoint in CI and locally.
- Run `bash infra/verify.sh` yourself and iterate until it exits 0. Never weaken, skip, or delete existing tests, database permission checks, or security assertions to make the gate pass.
- Record the commands you ran and the results you observed in `PLANS.md`.
- Apply additive migrations with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml run --rm --build migrate`. Rebuild with `docker compose -p academy-dev -f compose.yaml -f infra/compose.dev.yaml up -d --build --wait dev`. Verify `/api/health`, `/api/ready`, and the displayed version on `/ar` and `/en`. Preserve `academy-dev_postgres-data`.
- Commit all reviewed changes on the feature branch and push that branch to `origin`. If `gh` is installed and authenticated, open a PR targeting `main` with `gh pr create --base main` and watch **Foundation checks** with `gh pr checks --watch`. If CI fails, inspect the failed run with `gh run view <run-id> --log-failed`, fix the failure, rerun `bash infra/verify.sh`, and push the fix.
- Stop for human review and merge. Report the PR URL if available, the changed files, and the verification results.
