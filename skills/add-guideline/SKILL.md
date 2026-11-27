---
name: add-guideline
description: Use when adding or changing repository guidelines or verifiers under .agents/guidelines or .agents/verifiers.
metadata:
  internal: true
---

A guideline outlines strict rules to follow for specific parts of the repository codebase. A verifier is an automated check that accompanies a guideline, not a replacement for reading the guideline or reviewing requirements it cannot check.

Every verifier belongs to exactly one guideline. If any part of the guideline can be checked deterministically, the guideline must get a verifier. A guideline must always have exactly one verifier, or none otherwise.

A single verifier can check parts of multiple rules. A passing verifier only confirms what it checks; the remaining requirements still need review. In other words, a failed verifier is proof that something is wrong, but a passing verifier is NOT proof that everything is correct.

## Requirements

There is a meta guideline in `.agents/guidelines/guidelines-and-verifiers.md`, with the rules to follow when adding a new guideline and its (optional) verifier. You must read it and follow the rules.

## Verification

As a final check, run the relevant verifier through the repository runner:

```bash
pnpm run-verifiers --paths .agents/guidelines .agents/verifiers
```
