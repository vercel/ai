---
fileMatcher:
  - 'packages/*/src/**/*.ts'
  - 'packages/*/README.md'
  - 'content/**/*.mdx'
  - 'examples/**/*.ts'
  - 'examples/**/*.tsx'
  - '.changeset/*.md'
---

# Early Access Model ID Guidelines

Guidelines for model IDs that a provider serves only to allowlisted accounts, such as early access program (EAP), private preview, and trusted tester models.

## EAM-1: Keep early access model IDs out of published code, docs, examples, and changesets

- **Severity**: blocker
- **Applies to**: model catalogs, model ID types, provider docs, package READMEs, examples, and changesets
- **Sources**: PR #25393, PR #25407, PR #25421

Do not add a model ID that only allowlisted accounts can call (for example a Google model ID ending in `-eap`) to a model catalog, a model ID type, documentation, an example, or a changeset. Autocompletion, the docs, and the changelog suggest such an ID to every user, most users cannot call it, and the provider retires it once the feature launches under its regular model IDs.

Model ID parameters accept any string, so early access participants can pass their ID without a catalog entry. Use a publicly available model ID in docs and examples. When an example only works with an early access model, read the ID from an environment variable, as in `examples/ai-functions/src/generate-text/anthropic/model-id-alias.ts`.

The verifier flags model IDs with an `-eap` segment. It cannot detect early access IDs that are named differently, so check every new model ID against the provider's public model list.

Not affected by this rule:

- Test files may use early access model IDs, for example to cover model ID parsing.
- Released `CHANGELOG.md` entries are historical records and keep the IDs they name.

## EAM-2: Check for a public launch before describing a feature as early access

- **Severity**: warning
- **Applies to**: provider docs and changesets
- **Sources**: PR #25407

Before documenting a feature as part of an early access program, search the provider's public documentation, changelog, and blog for it, and repeat the search right before merging. Document a publicly launched feature under its public name with public model IDs, because program names, allowlist requirements, and defaults often change at launch and send readers to requirements that no longer apply.
