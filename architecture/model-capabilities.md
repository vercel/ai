# Model capabilities

The rules for structuring catalogs are in
[`.agents/guidelines/model-capabilities.md`](../.agents/guidelines/model-capabilities.md):

- **CAP-1**: Declare every per-model difference as its own capability on the
  model entry. Never derive it from an unrelated capability, a parsed model
  version, or family matching on the model ID.
- **CAP-2**: Make invalid capability states unrepresentable, and test the
  constraints types cannot express.
- **CAP-3**: Build derived providers on the base provider's catalog.
- **CAP-4**: Keep resolved capabilities overridable by the caller.

Parts of the current implementation predate these rules; see
[Known deviations](#known-deviations).

## Structure

A provider keeps one model catalog, keyed by model ID. Every entry follows the
same structure:

| Field             | Contains                                                                             |
| ----------------- | ------------------------------------------------------------------------------------ |
| `capabilities`    | What the model supports, grouped by operation                                        |
| `providerOptions` | Optional per-model support for the provider's declared options, grouped by operation |
| `requestConfig`   | Optional settings for encoding requests and choosing defaults, grouped by operation  |

A model can declare several operations in the same entry. There is no single
`type` discriminator that limits a model to one operation.

The shared types live in `packages/provider/src/model-capabilities.ts` and are
exported as `ModelEntry`, `ModelCapabilities`, and `ModelCapability`. Providers
supply their own typed request configuration. Existing versioned model interfaces
remain unchanged.

## Capability sections

Each section is optional. An omitted section means the catalog has not declared
that operation; it does not mean the operation is unsupported.

| Section                          | Describes                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `capabilities.language`          | Inputs, object generation, tools, reasoning, effort levels, and sampling parameters   |
| `capabilities.image`             | Input images, masks, output sizes, and image batch limits                             |
| `capabilities.video`             | Prompts, conditioning inputs, audio generation, generation controls, and batch limits |
| `capabilities.reranking`         | Text and object document inputs and top-N result limits                               |
| `capabilities.decision`          | Question types, image input, reasoning, and output-token controls                     |
| `capabilities.speech`            | Speech generation features                                                            |
| `capabilities.realtime`          | Conversation mode, transports, and supported connection methods                       |
| `capabilities.embedding`         | Default dimensions and custom dimension support                                       |
| `capabilities.transcription`     | Transcription, streaming, delay control, and returned metadata                        |
| `capabilities.speechTranslation` | Translated audio, translated text, and source transcripts                             |

Language image input and image generation are separate facts. Likewise,
transcription streaming does not imply realtime conversation support. Declare
each operation independently.

Individual support fields have four possible values:

| Value                           | Meaning                                    |
| ------------------------------- | ------------------------------------------ |
| `true`                          | Supported                                  |
| `false`                         | Unsupported                                |
| `'unknown'`                     | Support has not been established           |
| An object with `condition` text | Support depends on the described condition |

Lists and limits retain their appropriate types. Do not pair a support flag
with a field that only applies when the flag is set; use one field whose absence
or emptiness means unsupported (CAP-2).

Language capabilities use the same named groups in every provider catalog:

| Group              | Contains                                                   |
| ------------------ | ---------------------------------------------------------- |
| `inputs`           | Image and audio input support                              |
| `objectGeneration` | Structured object generation support                       |
| `tools`            | Tool usage and streaming; providers can add related fields |
| `reasoning`        | Reasoning support and declared effort levels               |
| `sampling`         | Temperature, top-p, and logprobs support                   |

Provider-specific language features extend these groups instead of creating
parallel top-level flags. OpenAI puts async tool calling under `tools`, service
tiers together under `serviceTiers`, prompt cache retention under `promptCache`,
and API-specific restrictions under `endpoints.chat` or `endpoints.responses`.
Sampling support belongs under `sampling` and is declared per entry, not
computed from reasoning support (CAP-1).

## Capabilities versus request configuration

Put feature support and its conditions under `capabilities`, including
provider-specific capabilities. OpenAI's service tiers, async tool calls,
configuration updates, cache retention, and reasoning-dependent sampling belong
under `capabilities.language`.

CAP-1 applies to request configuration too: when a request setting differs
between models, declare it on each entry instead of selecting it by model
version.

Put request encoding, routing, and defaults under `requestConfig`. The OpenAI
implementation uses these sections:

| Section                       | Fields                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| `requestConfig.language`      | System-message role                                                      |
| `requestConfig.image`         | Whether to request a response format or use the provider default         |
| `requestConfig.transcription` | Response format, chunking default, and singular or plural language field |
| `requestConfig.realtime`      | API selection, session startup, and finalization behavior                |

Anthropic uses `requestConfig.language` for its resolved maximum output-token
default and whether the requested model belongs to a known family.

The rule for choosing a location is: **feature availability belongs in
`capabilities`; how to send the request belongs in `requestConfig`.**

Exact aliases and ID normalization belong in lookup logic. They select an entry;
they never compute capabilities or request configuration. Model IDs without an
entry resolve to `'unknown'` values unless the caller overrides them (CAP-4).

## Provider options

Provider options are declared in two places:

| Level    | Declaration                                                       | Contains                                       |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| Provider | `ProviderOptionDefinitions`, e.g. `openaiProviderOptions`         | Each option name and description, by operation |
| Model    | `ModelEntry.providerOptions`, e.g. `providerOptions.language.foo` | A `ModelCapability` for each declared option   |

Option names match the keys accepted under `providerOptions.<provider>`. Each
provider-level declaration uses `satisfies Record<keyof Options, ...>` against
the option schema's inferred type, so adding or removing a schema option fails
type checking until the catalog is updated.

Model support defaults to `true` for catalog models and `'unknown'` for other
model IDs. Model-specific options must declare an exception, using one of these
sources:

1. The single capability the option configures, such as reasoning options
   following `reasoning.support` or `promptCacheOptions` following
   `promptCache.options`. An option never follows an unrelated capability.
2. A documented per-model fact in the catalog table, such as Anthropic's
   `effort` column, or an exact model ID for a single documented model.

## Runtime resolution

Request builders and documentation use the same resolved catalog. Current entry
points are `packages/openai/src/openai-model-catalog.ts` and
`packages/anthropic/src/anthropic-model-catalog.ts`. Each exports its catalog and
operation-specific entry resolvers.

Source declarations are organized by operation inside the catalog. The catalog
combines their named sections when the same model ID appears in more than one
operation. Consumers do not maintain a second model list or metadata file.

Lookup first uses the requested operation's catalog entry, then exact aliases.
A missing section does not cause a new rejection. Per-model differences stay in
table entries; the resolver does not add family or version rules (CAP-1).

Resolve explicit provider options, portable settings, and relevant conversation
state before applying conditional support. Human-readable condition text is not
executed. Typed capability policies drive runtime decisions and supply the
corresponding descriptions for documentation.

Resolve the entry once, when the model is created, and have request preparation
read that resolved entry. A second lookup by model ID would discard a caller's
override (CAP-4).

Endpoint restrictions must remain explicit. The same underlying model can expose
different features through different APIs. Deployment names remain separate from
the underlying model identity, and existing explicit API overrides retain their
precedence.

This refactor preserves existing request bodies, defaults, warnings, omissions,
fallbacks, and errors. Documentation metadata does not introduce new runtime
validation. Existing model properties, including Live's realtime capabilities,
can be derived from the catalog without changing their public shape.

## Documentation

`tools/generate-model-capabilities-docs.mjs` loads the OpenAI and Anthropic
catalogs directly from source. For each table it selects entries containing the
relevant capability section. One model can therefore appear in several tables
without duplicating its catalog entry. The generator owns presentation and column
selection, not model lists or capability decisions.

Register providers in `tools/model-capabilities-docs/providers.mjs` with their
catalog path and export, documentation path, and table definitions. Each table
declares its marker ID, capability section, and columns as `[heading, path,
optional formatter]`. Add matching `model-capabilities:<id>:start` and
`model-capabilities:<id>:end` markers around the table in the provider's MDX.
Providers in the shared language overview also declare an `overviewLink` matching
their existing rows. The shared renderer selects only language entries for that
overview, even when a catalog includes other operations.

Catalog loading and table rendering live in separate helpers. Adding a provider
requires no changes to the generation loop.

Run `pnpm generate:model-capabilities-docs` after changing the catalog.
`pnpm verify:model-capabilities-docs` compares the generated result with the
checked-in documentation without writing files; CI runs this check.

The current integration generates OpenAI's operation tables, Anthropic's language
table, and both providers' rows in the shared provider overview. Other providers
can adopt the same shape independently.

## Derived providers

Providers that serve another provider's models, such as Amazon Bedrock and
Anthropic AWS (Anthropic), Azure (OpenAI), and Google Vertex (Google), reuse the
base catalog's entries. They declare only the capabilities they add or override,
and never copy base entries or re-derive base capabilities (CAP-3).

## Caller overrides

Callers need to override individual capabilities when creating a model, or to
use another model's capabilities, for example to test an early-access model
under its real ID or under an existing model's ID. Catalog consumers must
therefore read the resolved entry rather than looking it up again (CAP-4). The
model factory API for supplying an override has not been designed yet.

## Maintaining the catalog

1. Find or add the model ID in the provider's source declarations.
2. Add the applicable capability sections. Reuse existing defaults where their
   semantics match, and keep model-specific exceptions in the entry.
3. Add request configuration only where encoding or defaults require it.
4. Have runtime consumers read the resolved entry instead of adding model-name
   checks to request construction.
5. Regenerate the documentation and run its consistency check, existing provider
   tests, workspace type checking, and `pnpm run-verifiers --modified`.

The current refactor adds no tests or examples and preserves all existing test
assertions and snapshots.

## Known deviations

These parts of the current implementation predate the rules above and are
expected to be migrated before capability lookups become public API:

- **CAP-2:** The shared `capabilities.language.reasoning` type pairs
  `support` with an optional `efforts` list, so an entry can declare
  `support: false` together with effort levels.
- **CAP-1:** The OpenAI catalog computes reasoning support, sampling support,
  reasoning efforts, service tiers, and other values from parsed GPT and o-series
  versions, and derives sampling support from reasoning support through
  `reasoning.sampling`.
- **CAP-1:** The Google, MiniMax, and Alibaba catalogs select capabilities or
  request protocols by comparing parsed model versions.
- **CAP-1:** The Anthropic catalog selects runtime definitions through
  substring matches on model families (`runtimeRules`).

The CAP-1 verifier lists the files with parsed-version comparisons as pending
migration. Remove a file from that list once its entries declare those values
directly.
