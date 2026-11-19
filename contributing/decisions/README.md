# Architecture Decision Records (ADR)

An Architecture Decision Record (ADR) captures an important architecture decision along with its context, rationale, and alternatives.

## Conventions

- Directory: `contributing/decisions`
- Naming: `YYYY-MM-DD-choose-database.md`
- Format: Context and Problem Statement, Decision, Alternatives Considered, and optional More Information
- Omit YAML frontmatter and explicit status fields; merging the ADR pull request accepts the decision
- Include tradeoffs in the decision and alternatives; keep implementation and verification in issues or PRs

## Workflow

- Propose a new ADR in a pull request and discuss it there.
- Merging the pull request accepts the decision; an explicit status is unnecessary.
- If replaced later: create a new ADR and link both records, explaining the replacement.

## ADRs

- [Adopt architecture decision records](2026-03-11-adopt-architecture-decision-records.md) (2026-03-11)
- [Keep tool error text unchanged in UI messages](2026-11-12-keep-tool-error-text-unchanged-in-ui-messages.md) (2026-11-12)
