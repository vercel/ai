# Template Variants

Both templates record decisions and rationale with the same concise structure:

1. Context and Problem Statement
2. Decision, including scope and accepted tradeoffs
3. Alternatives Considered, including benefits, drawbacks, and reasons for rejection
4. More Information (optional)

Omit explicit status fields; a merged ADR pull request means the decision is accepted. Keep unfinished decisions in draft pull requests, which must not be merged. Neither template has YAML frontmatter, a separate Consequences section, implementation steps, or verification checklists. Link to issues or PRs for implementation and verification.

## Simple (Default)

Use `assets/templates/adr-simple.md` for most decisions. Alternatives can be short bullets when each tradeoff fits in a sentence or two.

## Expanded Alternatives

`assets/templates/adr-madr.md` retains its filename and `--template madr` selector for existing callers, but uses the same concise format as Simple. It adds headings within Alternatives Considered when an option needs more explanation. Add or remove option headings as needed.

The number of options does not require extra top-level sections. Start with Simple and expand only the reasoning that needs room.
