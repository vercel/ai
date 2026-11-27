---
fileMatcher:
  - '.agents/guidelines/**'
  - '.agents/verifiers/**'
---

# Guidelines and Verifiers

Guidelines for adding and editing repository guidelines and their verifiers.

## GV-1: Scope each guideline to the files its rules govern

- **Severity**: blocker

Start with [`_TEMPLATE.md`](_TEMPLATE.md) and save the guideline as `.agents/guidelines/<name>.md`. Set `fileMatcher` to repository-relative globs that cover the files governed by the rules. Use exclusions for intentional exceptions. Discovery ignores the template and excludes test files from matching.

Use one H1 title and put each rule in an H2 section. State a durable requirement, why violating it matters, and any narrower scope or exceptions. Include the severity and link relevant decisions or implementation guidance instead of copying them. Keep requirements in the guideline, not in the skill or verifier.

## GV-2: Give each rule a stable, unique ID

- **Severity**: blocker

Write each rule heading as `## ACRONYM-1: Imperative rule title`. Use one uppercase acronym per guideline, with distinct positive integers for its rules. Reserve that acronym for this guideline alone, even if another guideline would use different numbers. Keep existing IDs stable when editing or reordering rules so past verifier output still refers to the same requirements.

## GV-3: Give each guideline at most one matching verifier

- **Severity**: blocker

Add a verifier when at least one part of the guideline can be checked deterministically. Leave judgment-based requirements to review. Combine deterministic checks for all applicable sections in a single executable `.agents/verifiers/<name>.ts` file with the same basename as its guideline. Never add a verifier without a matching guideline. Rename or remove the verifier along with its guideline.

Use `runVerifier` from [`tools/verifiers/api.ts`](../../tools/verifiers/api.ts) and report violations with the exact rule IDs in the guideline. The runner selects input files using the guideline's `fileMatcher`; a verifier may read other repository files when necessary to evaluate a rule.

## GV-4: Keep verifier-specific helpers in the verifier

- **Severity**: blocker

Keep the verifier's implementation, including any helpers specific to it, in the verifier file. Reuse existing shared code from `tools/verifiers/`, but do not add helpers there solely to support the verifier you are writing. This keeps the shared tooling independent of individual guidelines.
