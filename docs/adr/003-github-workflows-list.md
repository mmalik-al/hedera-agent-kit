# ADR 003 — Required GitHub Workflows (Overview and Responsibilities)

This document enumerates the GitHub Actions workflows that should be implemented to fulfill ADR 003 (NPM Release Process) and its acceptance criteria. For each workflow, we describe purpose, triggers, responsibilities, key jobs/steps, required secrets/permissions, and success criteria.

See also:
- ADR 003: docs/adr/003-release-process.md
- Acceptance Criteria: docs/adr/003-release-process-acceptance-criteria.md

## 1) PR Validation Workflow
- Name (suggested): pr-validation.yml
- Purpose: Provide fast feedback on pull requests targeting `main` by enforcing basic quality gates.
- Triggers: pull_request targeting `main`.
- Responsibilities:
  - Install dependencies with caching (workspace: `typescript/`).
  - Run static checks: ESLint, Prettier check, TypeScript typecheck.
  - Run unit tests on a Node.js version matrix (e.g., 18, 20, 22) on ubuntu-latest.
  - Validate commit messages (Conventional Commits) for PR commits.
  - Upload test reports/artifacts.
- Key jobs/steps:
  - checkout -> setup-node -> cache -> npm ci -> lint -> typecheck -> format check -> test:unit -> upload artifacts.
- Permissions: contents: read; actions: read; checks: write (for annotations) minimal.
- Secrets: none required.
- Success criteria: All jobs green; annotations visible for failures; required status checks block merges if failing.

## 2) PR Extended Tests Workflow (Integration & Tool-Calling)
- Name: pr-integration-and-tools.yml
- Purpose: Run heavier suites that validate integrations and tool-calling behavior on PRs to `main`.
- Triggers: pull_request targeting `main`.
- Responsibilities:
  - Execute integration tests and tool-calling validation using the primary LLM (GPT-4) only.
  - Optionally run sample builds for examples under `typescript/examples` to ensure examples stay healthy.
  - Upload reports and logs.
- Key jobs/steps:
  - checkout -> setup-node -> npm ci -> test:integration -> test:tool-calling --llm=gpt-4 -> build examples (if present).
- Permissions: contents: read; checks: write.
- Secrets: OPENAI_API_KEY (and any provider keys required by the tests) from repository secrets.
- Success criteria: All integration and tool-calling tests pass; artifacts uploaded.

## 3) Branch Push Workflow (Lightweight CI on non-main branches)
- Name: branch-push-ci.yml
- Purpose: Give contributors feedback on feature branches without running heavy suites.
- Triggers: push on all branches except `main`.
- Responsibilities:
  - Lint, typecheck, unit tests on default Node version (e.g., 20) on ubuntu-latest.
- Key jobs/steps: checkout -> setup-node -> npm ci -> lint -> typecheck -> test:unit.
- Permissions: contents: read.
- Secrets: none required.
- Success criteria: Jobs pass; fast turnaround.

## 4) Release Workflow (semantic-release to NPM)
- Name: release.yml
- Purpose: Perform controlled releases to NPM with full verification.
- Triggers:
  - workflow_dispatch with `dry_run` boolean input (manual releases per ADR).
  - Optionally schedule (cron) for Thursday, requiring manual approval via environment protection.
- Responsibilities:
  - Run full test matrix: unit, integration, tool-calling, and optionally E2E tests; for releases, use multiple LLMs.
  - Build the package in `typescript/`.
  - Run semantic-release to calculate version, generate notes, create tag, publish to NPM, and create GitHub Release.
  - Generate provenance/SLSA attestation if configured.
- Key jobs/steps:
  - checkout (fetch-depth: 0) -> setup-node (with registry-url) -> npm ci -> run full tests -> build -> semantic-release.
- Permissions: contents: write; id-token: write (for provenance); packages: write (if using GH packages); pull-requests: write (for release notes comments); issues: write (optional).
- Secrets: NPM_TOKEN, GITHUB_TOKEN (provided), LLM provider keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.).
- Success criteria: semantic-release outputs new version or indicates no release; Git tag and GitHub Release exist; package published to NPM; changelog updated/attached; provenance artifact present if enabled.

## 5) Hotfix Release Workflow (Manual, scoped)
- Name: hotfix-release.yml
- Purpose: Enable manual, targeted hotfix releases with explicit inputs and safeguards.
- Triggers: workflow_dispatch with inputs (branch, dry_run, confirmation text).
- Responsibilities:
  - Check out specified hotfix branch; run essential tests; optionally skip heavy suites.
  - Run semantic-release restricted to that branch or use manual version bump if required.
- Key jobs/steps: similar to Release, but with explicit branch checkout and extra confirmation gates.
- Permissions/Secrets: same as Release.
- Success criteria: Hotfix published or dry-run completed; no accidental releases from forks.

## 6) Security Scanning Workflow (CodeQL or equivalent)
- Name: security-codeql.yml
- Purpose: Static application security analysis.
- Triggers: push to `main`, pull_request to `main`, and scheduled weekly scan.
- Responsibilities: Initialize CodeQL for JavaScript/TypeScript, analyze, upload SARIF results.
- Permissions: security-events: write; contents: read.
- Secrets: none.
- Success criteria: Alerts visible in the Security tab; PRs annotated if issues present.

## 7) Dependency and License Compliance Workflow
- Name: deps-and-licenses.yml
- Purpose: Detect vulnerable or non-compliant dependencies pre-release.
- Triggers: pull_request to `main`, schedule weekly.
- Responsibilities:
  - Run `npm audit` (or alternative) and a license checker against allow/deny lists.
  - Fail the workflow on high/critical vulnerabilities or disallowed licenses.
- Permissions: contents: read.
- Secrets: none.
- Success criteria: Reports uploaded; failures block merges when criteria violated.

## 8) Package Contents and Size Guard Workflow
- Name: package-sanity.yml
- Purpose: Ensure only intended files are published, and package size within limits.
- Triggers: pull_request to `main`.
- Responsibilities:
  - Build and run `npm pack --dry-run` inside `typescript/`.
  - Diff against allowed files list; check tarball size threshold.
- Permissions: contents: read.
- Secrets: none.
- Success criteria: Allowed files only; size under threshold; artifact uploaded.

## 9) Example/Integration Build Workflow
- Name: examples-build.yml
- Purpose: Verify developer examples and integrations still build.
- Triggers: pull_request to `main`, schedule daily.
- Responsibilities: Install and build `typescript/examples/*` projects or scripts indicated in docs.
- Permissions: contents: read.
- Secrets: any keys required only if examples exercise live network; otherwise none.
- Success criteria: All example builds succeed; logs uploaded.

## 10) Documentation and Changelog Sync Workflow
- Name: docs-and-changelog.yml
- Purpose: Keep docs healthy; ensure changelog presence/links.
- Triggers: pull_request to `main`.
- Responsibilities: Lint markdown, check links, verify CHANGELOG.md updates exist for changes flagged by semantic-release dry-run.
- Permissions: contents: read.
- Secrets: none.
- Success criteria: No broken links; changelog expectations met.

## 11) Nightly Maintenance Workflow
- Name: nightly-maintenance.yml
- Purpose: Run non-blocking maintenance tasks.
- Triggers: schedule (cron, nightly).
- Responsibilities: Dependency updates checks, link checks, optional canary builds/tests.
- Permissions: contents: read.
- Secrets: none.
- Success criteria: Reports uploaded; alerts created if regressions detected.

## 12) Provenance/Attestation Workflow (optional if combined with release)
- Name: provenance.yml
- Purpose: Generate SLSA provenance or npm provenance attestations.
- Triggers: Called from release or on tag creation.
- Responsibilities: Use OIDC (id-token: write) to sign and upload attestations.
- Permissions: id-token: write; contents: write (if uploading release assets).
- Secrets: none (OIDC used), unless specific signing keys are used.
- Success criteria: Attestation artifact attached to release; verifiable provenance badge.

---

Implementation notes:
- Place workflow files under .github/workflows/ with the suggested names.
- Scope all Node/npm commands to the `typescript/` directory to avoid inadvertently operating on non-package paths.
- Use actions/setup-node with caching and registry-url during release jobs.
- Protect secrets; never echo tokens. Use environment protection rules for release environments.
- Set required status checks in branch protection: pr-validation, pr-integration-and-tools, deps-and-licenses, package-sanity.
