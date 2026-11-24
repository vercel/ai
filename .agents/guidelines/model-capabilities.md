---
fileMatcher:
  - 'packages/*/src/*-model-catalog.ts'
  - 'packages/*/src/*-model-capabilities.ts'
  - 'packages/provider/src/model-capabilities.ts'
  - 'packages/provider-utils/src/model-capabilities.ts'
---

# Model Capabilities Guidelines

Guidelines for structuring provider model catalogs and the shared model capability types.

## CAP-1: Declare every per-model difference as its own capability on the model entry

- **Severity**: blocker
- **Applies to**: capability values, provider option support, and request configuration in provider model catalogs
- **Sources**: PR #25291, `architecture/model-capabilities.md`

When a behavior differs between models, give it its own field and set that field on each model entry. Never derive it from an unrelated capability (for example, sampling parameter support from reasoning support), from a model generation, version, or series number parsed out of the model ID, or from family matching on the ID. Derived rules hide what a field means and break as soon as a new model contradicts them, which then forces a rule change instead of a one-line catalog change.

For example, declare `sampling: { temperature: false, ... }` on each entry that rejects sampling parameters instead of computing it from `reasoning.support`, and declare `serviceTiers.flex` per entry instead of enabling it for "GPT 5 and later".

Not affected by this rule:

- Exact aliases (for example, a dated snapshot ID that maps to a catalog key) and ID normalization such as stripping a cross-region inference prefix. These resolve which entry applies; they do not compute capabilities.
- A provider option whose support follows the single capability it configures, such as `reasoningEffort` following `reasoning.support`.
- Model IDs without a catalog entry. They resolve to `'unknown'` values unless the caller overrides them (see CAP-4), not to values inferred from similar IDs.

## CAP-2: Make invalid capability states unrepresentable

- **Severity**: blocker
- **Applies to**: the shared types in `packages/provider/src/model-capabilities.ts` and provider-specific capability types
- **Sources**: PR #25291

Shape capability types so that contradictory combinations cannot be written. Do not pair a boolean flag with a field that only means something when the flag is set, such as `supportsReasoning: boolean` alongside `supportedReasoningLevels: string[]`, because `supportsReasoning: false, supportedReasoningLevels: ['high']` then type-checks. Use one field instead, such as `supportedReasoningLevels: undefined | string[]`, where an absent or empty list means no reasoning, or a discriminated union when the dependent data is richer.

When the type system cannot express a constraint, add a unit test that checks every catalog entry for it, so that an invalid entry fails CI.

## CAP-3: Build derived providers on the base provider's catalog

- **Severity**: warning
- **Applies to**: providers that serve another provider's models, such as Amazon Bedrock and Anthropic AWS (Anthropic), Azure (OpenAI), and Google Vertex (Google)
- **Sources**: PR #25291

Reuse the base provider's entries and declare only the capabilities the derived provider adds or overrides, such as a feature the hosting platform does not expose. Never copy base entries or re-derive base capabilities in the derived catalog, because copies drift from the base catalog as soon as a model changes.

## CAP-4: Keep resolved capabilities overridable by the caller

- **Severity**: warning
- **Applies to**: request preparation and model construction code that reads catalog entries
- **Sources**: PR #25291

Resolve a model's catalog entry once, when the model is created, and have request preparation read that resolved entry instead of looking capabilities up by model ID again. Callers need to be able to override individual capabilities when creating a model, or to use another model's capabilities, for example to test an early-access model under its real ID or under an existing model's ID. A second lookup by model ID silently discards such an override.
