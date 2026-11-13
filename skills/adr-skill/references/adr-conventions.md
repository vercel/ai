# ADR Conventions (Reference)

## Directory

Store ADRs in `contributing/decisions/` and keep its `README.md` index current.

## Filename Conventions

Pattern: `YYYY-MM-DD-title-with-dashes.md`

- `YYYY-MM-DD` is the ADR creation date; keep it stable when updating the record.
- Title uses lowercase, dashes, present-tense imperative verb phrase.
- Examples: `2025-06-15-choose-database.md`, `2025-07-01-adopt-adrs.md`
- Multiple ADRs on the same date are fine — the slug suffix disambiguates them.

## Sections

Use Context and Problem Statement, Decision, and Alternatives Considered. More Information is optional. Include accepted tradeoffs in Decision and option-specific tradeoffs with the alternatives. Do not repeat them in a separate Consequences section.

Keep implementation plans and verification in issues and pull requests, linked from the ADR when useful. Do not add YAML frontmatter.

## Acceptance

An ADR is accepted when its pull request merges, therefore an explicit status on the ADR is unnecessary.

Do not add explicit status fields to ADRs or index entries. Keep the creation date in the filename and index. If a decision is deprecated or superseded, explain why in More Information and link any replacement in both directions.

## Mutability

- Prefer appending new information with a date stamp over rewriting existing content.
- If a decision is replaced, create a new ADR and explicitly supersede the old one.
- After-action notes are fine to edit in place.

## Categories (Large Projects)

For repos accumulating many ADRs, use subdirectories:

```
contributing/decisions/   # or docs/decisions/
  backend/
    2025-06-15-use-postgres.md
  frontend/
    2025-06-20-use-react.md
  infrastructure/
    2025-07-01-use-terraform.md
```

Date prefixes are local to each category. Choose a categorization scheme early (by architectural layer, by domain, by team) and document it in the index.

Alternative: use tags or a flat structure with a searchable index. Subdirectories are simpler and work with all tools.
