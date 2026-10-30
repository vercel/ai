# Model capabilities

Anything that differs between the models of a provider is a capability in the
provider's model catalog. Request code reads capabilities from the catalog
instead of checking model IDs.

## Model catalogs

A provider defines one catalog per model type with `defineModelCatalog` from
`@ai-sdk/provider-utils`, and reads it with `getModelCapabilities`:

```ts
export const openaiLanguageModelCatalog =
  defineModelCatalog<OpenAILanguageModelCapabilities>({
    // Strip snapshot dates and similar suffixes before matching:
    normalize: modelId => modelId.replace(/-\d{4}-\d{2}-\d{2}$/, ''),
    entries: [
      { match: ['gpt-5.4', 'gpt-5.4-mini'], capabilities: gpt52 },
      { match: 'gpt-5.4-nano', capabilities: withoutPriority(gpt52) },
      { match: /^gpt-5\.[2-5](?:-|$)/, capabilities: gpt52 },
    ],
    fallback: () => unknownLanguageModel,
  });

const { capabilities, isKnownModel } = getModelCapabilities(
  openaiLanguageModelCatalog,
  modelId,
);
```

Model IDs are matched in this order:

1. **Exact IDs** after `normalize`. A string or an array of strings in `match`.
2. **Model families**. A regular expression in `match`, tested in entry order.
   Use families for snapshots, variants, and the best guess for models that
   are not released yet, e.g. `gpt-5.7` resolving like GPT-5.6.
3. **`fallback`** for everything else. `isKnownModel` is `false`.

Exact IDs always win over families, so an entry for `claude-opus-5-5` is never
shadowed by a family for `claude-opus-5`. Duplicate exact IDs throw.

The models listed by exact ID are the documented models. They are exposed as
`catalog.knownModels` and generate the documentation tables.

### Fallback capabilities are broad

Unknown models are often not the provider's own models, e.g. a model behind an
OpenAI-compatible server. The fallback lets requests through as specified and
leaves validation to the API: it does not strip settings, add defaults, or
warn about unsupported features.

Capabilities that select a request shape rather than validate one, such as
Google's JSON response tool, keep the behavior that is correct for most
unknown models.

## Capabilities

Each catalog has a capability type owned by the provider. Capabilities are
plain data: no functions, no `'unknown'` values, and no text that describes a
condition.

- **One field per behavior.** Do not infer a capability from an unrelated one,
  e.g. the system message role from whether the model reasons.
- **Descriptive data over booleans that can contradict each other.** For
  example, Anthropic's `reasoning.disabled` is
  `'supported' | 'up-to-high-effort' | 'unsupported'` instead of two flags.
- **Name fields after what the API accepts or does**, e.g.
  `serviceTiers.flex` or `chat.functionToolsWithReasoning`.

Shared capability types in `@ai-sdk/provider-utils` define the capabilities
that every catalog of a model type declares with the same meaning, e.g.
`LanguageModelCapabilities` with `inputs`, `objectGeneration`, `tools`, and
`reasoning`. Provider types extend them.

Whether a model supports a provider option is a capability too, e.g. OpenAI's
`configurationUpdates` for `reasoningEffortUpdate`.

User-facing overrides such as OpenAI's `forceReasoning` and `systemMessageMode`
provider options are applied on top of the resolved capabilities.

## Model ID types

Model ID types such as `OpenAIResponsesModelId` stay string unions. Each
provider's catalog test holds a list of the union's IDs that type checking
keeps in sync with the union, checks that every ID is a known model, and
snapshots the capabilities of every ID. A second snapshot covers model IDs
that are not listed: snapshots, host prefixes, model families, and unknown
models. Catalog data is tested with these snapshots, not with hand-written
assertions:

```ts
const modelIds = [
  'claude-opus-5-5',
  // ...
] as const satisfies readonly KnownModelId<AnthropicModelId>[];
expectTypeOf<
  Exclude<KnownModelId<AnthropicModelId>, (typeof modelIds)[number]>
>().toBeNever();
```

## Documentation

`tools/generate-model-capabilities-docs.mjs` loads the catalogs from source and
renders tables of their known models into marked sections of the provider
docs, plus the provider's rows in the shared language overview.

Register providers in `tools/model-capabilities-docs/providers.mjs`. Each table
declares its marker ID, the exported catalog, and its columns as
`[heading, capabilities => cell]`. Add matching
`model-capabilities:<id>:start` and `model-capabilities:<id>:end` markers
around the table in the provider's MDX.

Catalog files may only import `@ai-sdk/provider-utils` and local files at
runtime. The loader resolves `@ai-sdk/provider-utils` to
`packages/provider-utils/src/model-catalog.ts`, which has no runtime imports.

Run `pnpm generate:model-capabilities-docs` after changing a catalog.
`pnpm verify:model-capabilities-docs` checks the docs without writing files;
CI runs this check.

## Adding a model

1. Add the model ID to the model ID type and to the ID list in the catalog
   test.
2. Add it to an existing catalog entry, or add an entry that spreads the
   closest existing capabilities and overrides what differs.
3. If the model needs new behavior, add a capability and read it in the
   request code.
4. Update the snapshots (`pnpm test:update`) and regenerate the docs.

Current catalogs: `packages/openai/src/openai-model-catalog.ts`,
`packages/anthropic/src/anthropic-model-catalog.ts`, and
`packages/google/src/google-model-catalog.ts`.
