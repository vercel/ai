# Architecture Decision Records (ADR)

An Architecture Decision Record (ADR) captures an important architecture decision along with its context, rationale, and alternatives.

## Conventions

- Directory: `{ADR_DIR}`
- Naming:
  - Use date-prefixed files: `YYYY-MM-DD-choose-database.md`
  - If the repo already uses slug-only names, keep that: `choose-database.md`
- Format: Context and Problem Statement, Decision, Alternatives Considered, and optional More Information
- Omit YAML frontmatter and explicit status fields; merging the ADR pull request accepts the decision
- Include tradeoffs in the decision and alternatives; keep implementation and verification in issues or PRs

## Workflow

- Propose a new ADR in a pull request and discuss it there.
- Keep unfinished decisions in draft pull requests; draft pull requests must not be merged.
- Merging the pull request accepts the decision. Close the pull request if the decision is rejected.
- If replaced later: create a new ADR and link both records, explaining the replacement.

## ADRs
