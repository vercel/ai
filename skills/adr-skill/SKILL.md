---
name: adr-skill
description: Create, update, or consult Architecture Decision Records (ADRs). Use when capturing an architecture decision and its rationale, maintaining its lifecycle, or checking decisions that govern planned changes.
metadata:
  internal: true
---

# ADR Skill

An ADR records what we decided and why. Keep it concise and self-contained so future contributors and coding agents can understand the decision without the original conversation. Implementation plans and verification belong in issues and pull requests.

## When to Write an ADR

Write an ADR for decisions that change how the system is built or operated, have meaningful alternatives, and affect future work: architecture patterns, dependencies, infrastructure, or API design.

Routine implementation choices, bug fixes, and style preferences usually do not need an ADR. If a decision is already covered, update or reference the existing record.

When an architectural choice comes up during implementation, propose capturing it if its rationale would help future contributors. Respect the user's requested scope.

## Create an ADR

### Gather Context

1. Find the ADR directory and read its index. This repo uses `contributing/decisions/`; other repos may use `docs/decisions/` or `adr/`.
2. Read relevant accepted decisions and inspect related code, dependencies, and constraints.
3. Use the supplied discussion or request to identify the problem, chosen option, alternatives, tradeoffs, and non-goals. Ask focused questions only for material gaps; do not repeat questions already answered by the source.
4. If a choice would contradict an accepted ADR, discuss the conflict with the human before implementing it. An explicit request to change that decision provides the intent for updating the record.

### Draft

Use [assets/templates/adr-simple.md](assets/templates/adr-simple.md) by default. For alternatives that need more room, expand that section with option headings; [assets/templates/adr-madr.md](assets/templates/adr-madr.md) provides that layout with the same concise sections. See [references/template-variants.md](references/template-variants.md).

- **Context and Problem Statement**: the problem, trigger, and relevant constraints.
- **Decision**: what is chosen, why, scope, non-goals, and accepted tradeoffs.
- **Alternatives Considered**: the benefits and drawbacks of other options and why they were rejected. Avoid repeating the same tradeoffs in multiple sections.
- **More Information** (optional): related records, PRs, issues, references, and revisit conditions.

Do not add YAML frontmatter, a separate Consequences section, an Implementation Plan, or Verification checklists. Do not add explicit status fields; merging the ADR pull request accepts the decision. Dates belong in date-prefixed filenames and the index; participants can be credited in the linked discussion or pull request.

Use the existing directory and filename convention, normally `YYYY-MM-DD-verb-phrase.md`. Propose decisions in pull requests. Keep unfinished decisions in draft pull requests, which must not be merged. Merging the pull request accepts the decision; close it if the decision is rejected. Keep the index current.

The generator creates a scaffold; fill or remove every placeholder before finalizing:

```bash
node skills/adr-skill/scripts/new_adr.js --title "Choose database" --update-index
```

When used outside this repository, resolve the script path relative to the installed skill directory. It auto-detects the ADR directory and naming strategy; `--dir`, `--strategy`, and `--template simple|madr` override those choices.

### Review

Use [references/review-checklist.md](references/review-checklist.md). Check that the rationale, alternatives, scope, and accepted costs are clear. Report material gaps and fix what can be resolved from the available evidence. Do not inflate the record to satisfy a template.

See [references/examples.md](references/examples.md) for a filled-out example and [references/adr-conventions.md](references/adr-conventions.md) for naming and lifecycle details.

## Consult Existing ADRs

Before changing architecture, scan the index and read relevant accepted ADRs fully. Follow their decisions and constraints. Check for ADR references in code when a pattern's rationale is unclear.

If implementation differs from a decision, flag the discrepancy. Do not silently replace an accepted decision with a different choice. Reference the governing ADR in the implementation PR, and add a lightweight code comment at a key entry point when it helps discoverability:

```typescript
// ADR: contributing/decisions/2025-06-15-use-sqlite-for-test-database.md
```

ADRs can link to the implementation PR or key code entry points in More Information without duplicating a file-by-file implementation plan.

## Update an Existing ADR

- **Deprecate**: explain why the decision no longer applies in More Information.
- **Supersede**: create a replacement ADR and link both records.
- **Add learnings**: append a dated note in More Information. Preserve the original rationale.
- **Simplify formatting**: preserve the decision and relevant reasoning; move tradeoffs into Decision or Alternatives Considered and leave implementation and verification detail in linked PRs or issues.

Update the index entry as well. Track implementation work in issues or PRs, link back to the ADR, and add later learnings when they affect the rationale or revisit conditions.

## Bootstrap

For a repo without ADRs:

```bash
node skills/adr-skill/scripts/bootstrap_adr.js --dir contributing/decisions
```

This creates an index and an initial decision explaining why the project uses ADRs. Use an appropriate directory for the target repo. Both generators support `--json` for machine-readable output.
