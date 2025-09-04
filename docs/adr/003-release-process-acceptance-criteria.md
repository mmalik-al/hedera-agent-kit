# ADR 003 — GitHub Actions Acceptance Criteria (High-Level)

This document defines high-level, testable acceptance criteria for implementing GitHub Actions that fulfill ADR 003: NPM Release Process for the Hedera Agent Kit TypeScript SDK.

## 1. Triggers and Branching
- Pull Requests:
  - On PRs targeting `main`, workflow runs unit, integration, and tool-calling validation tests.
  - Status checks must report back to GitHub with pass/fail and annotations for failures.
- Pushes:
  - On any branch push, workflow runs unit tests and static checks (lint, type check).
- Releases:
  - On merges to `main`, a release workflow evaluates whether a release is warranted based on Conventional Commits and performs the release if criteria are met.

## 2. Versioning and Changelog (semantic-release)
- Version calculation is automated via `semantic-release` based on commit messages following Conventional Commits.
- Generated release notes and `CHANGELOG.md` are produced/updated for each release.
- Git tag is created for each release (e.g., `vMAJOR.MINOR.PATCH`).
- Manual override support exists for hotfixes/special releases (documented input or dispatch).

## 3. Commit Conventions Enforcement
- CI validates Conventional Commits format on PRs (e.g., via commit lint) and fails with actionable messages if violations occur.

## 4. Quality Gates (Static Analysis)
- Linting (ESLint) runs on all pushes and PRs.
- Type checking (tsc) runs on all pushes and PRs.
- Formatting check (Prettier or equivalent) runs or is verified.

## 5. Testing Strategy
- Unit tests run on:
  - All pushes (any branch)
  - PRs to `main`
- Integration and tool-calling validation tests run on PRs to `main` and on release workflow.
- Release workflow runs the full test matrix (unit, integration, tool-calling validation, end-to-end when applicable) and must pass prior to publishing.
- Test results are uploaded (e.g., JUnit) and surfaced in GitHub UI.

## 6. Node/OS Matrix and Caching
- CI tests run across a supported Node.js version matrix (min supported, current LTS, latest) and at least Linux; optional Windows/macOS if required by ADR scope.
- Dependency caching is enabled to speed up installs without compromising correctness.

## 7. Build, Packaging, and Artifacts
- Build step produces the distributable TypeScript package(s) (including type declarations and source maps where applicable).
- Workspace correctly scopes to `typescript/` package.
- Pack step (`npm pack --dry-run`) verifies publish contents on PRs.
- Built artifacts for PRs are uploaded as workflow artifacts for inspection.

## 8. Security and Compliance
- Vulnerability scanning runs on PRs and release (e.g., `npm audit` or OSS review tool).
- License compliance check runs (e.g., allowlist/denylist) and fails on violations.
- Supply-chain checks:
  - npm provenance/SLSA or GitHub OIDC signing is enabled for published packages when supported.
  - Integrity of the release job is verifiable (workflow provenance badge or attestation artifact).

## 9. Publishing to NPM
- Publishing occurs only from the `main` branch via `semantic-release` when criteria are met.
- NPM authentication uses GitHub Actions secrets; tokens are not printed in logs.
- Dry-run mode is available for validation.
- Post-publish confirmation includes published version, tag, changelog link, and package URL.

## 10. Documentation and Change Visibility
- Release notes are generated and attached to GitHub Releases.
- `CHANGELOG.md` is updated in the repository (committed via automation) or generated and attached per ADR.
- README and docs links to the latest version remain valid; if docs versioning is in scope, the workflow updates them.

## 11. Notifications
- Workflow posts status notifications for releases (success/failure) to a configured channel (e.g., GitHub Releases, issue comment, or chat integration if configured).

## 12. Permissions and Safety
- Workflow uses least-privilege permissions; `GITHUB_TOKEN` scopes are minimized.
- Protected branches and required status checks block merges when CI fails.
- Release job is guarded to prevent accidental releases from forks.

## 13. Observability and Logs
- Key steps log essential information without leaking secrets (redaction verified).
- Artifacts include build logs and test reports for troubleshooting.

## 14. Manual Operations
- Documented manual dispatch exists for hotfix release with explicit inputs and safeguards.
- Capability to skip release via commit message or workflow input (e.g., `[skip release]`) is documented.

## 15. Idempotency and Re-runs
- Re-running a failed job does not produce duplicate NPM publishes or duplicate tags.
- semantic-release handles already-published versions gracefully and exits without side effects.

## 16. Backwards Compatibility Gates
- If a backward incompatible change is detected (e.g., marked `BREAKING CHANGE`), CI requires at least one maintainer approval before release proceeds.

## 17. Documentation Linkage
- ADR 003 references this acceptance criteria document, or this file references ADR 003 for traceability.

---

References: ADR 003 — docs/adr/003-release-process.md