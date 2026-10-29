---
fileMatcher: # globs matched against changed file paths; guideline file is skipped if none match
  - 'services/**'
  - '!services/special-file.ts' # exclusions (prefixed with !) are supported and will not trigger this guideline
---

# My Guidelines

One-line description of what this set of guidelines covers.

## XX-1: Imperative one-line statement of the law

- **Severity**: blocker | warning
- **Sources**: relevant decision/discussion links (e.g. issues, PRs, broader documentation)

State the durable requirement and the serious consequence of violating it in one sentence.
Keep the scope and known exceptions explicit. Link detailed implementation guidance rather
than copying it here. Prefer a deterministic check when the requirement can be enforced that way.
