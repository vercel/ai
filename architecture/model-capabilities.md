# Model capabilities

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

| Section                          | Describes                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `capabilities.language`          | Inputs, object generation, tools, reasoning, effort levels, and sampling parameters |
| `capabilities.image`             | Input images, masks, output sizes, and image batch limits                           |
| `capabilities.speech`            | Speech generation features                                                          |
| `capabilities.realtime`          | Conversation mode, transports, and supported connection methods                     |
| `capabilities.embedding`         | Default dimensions and custom dimension support                                     |
| `capabilities.transcription`     | Transcription, streaming, delay control, and returned metadata                      |
| `capabilities.speechTranslation` | Translated audio, translated text, and source transcripts                           |

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

Lists and limits retain their appropriate types. An omitted list of reasoning
efforts means that no exhaustive list is declared, not that every effort works.

Language capabilities use the same named groups in every provider catalog:

| Group              | Contains                                                   |
| ------------------ | ---------------------------------------------------------- |
| `inputs`           | Image and audio input support                              |
| `objectGeneration` | Structured object generation support                       |
| `tools`            | Tool usage and streaming; providers can add related fields |
| `reasoning`        | Reasoning support and declared effort levels               |
| `sampling`         | Temperature, top-p, and logprobs support                   |

Provider-specific language features extend these groups instead of creating
parallel top-level flags. OpenAI puts async tool calling under `tools`, its
reasoning-dependent sampling policy under `reasoning`, service tiers together
under `serviceTiers`, prompt cache retention under `promptCache`, and API-specific
restrictions under `endpoints.chat` or `endpoints.responses`.

## Capabilities versus request configuration

Put feature support and its conditions under `capabilities`, including
provider-specific capabilities. OpenAI's service tiers, async tool calls,
configuration updates, cache retention, and reasoning-dependent sampling belong
under `capabilities.language`.

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

Aliases and model-family matching belong in lookup logic. They are neither
capabilities nor request configuration.

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

1. A capability the entry already declares, such as reasoning options following
   `reasoning.support` or `promptCacheOptions` following `promptCache.options`.
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

Lookup first uses the requested operation's catalog entry. Otherwise, it preserves
the provider's existing alias, family, or unknown-model behavior. A missing
section does not cause a new rejection. Exact model exceptions stay in table
entries; family rules stay in the resolver.

Resolve explicit provider options, portable settings, and relevant conversation
state before applying conditional support. Human-readable condition text is not
executed. Typed capability policies drive runtime decisions and supply the
corresponding descriptions for documentation.

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

## Maintaining the catalog

1. Find or add the model ID in the provider's source declarations.
2. Add the applicable capability sections. Reuse existing defaults where their
   semantics match, and keep model-specific exceptions in the entry.
3. Add request configuration only where encoding or defaults require it.
4. Have runtime consumers read the resolved entry instead of adding model-name
   checks to request construction.
5. Regenerate the documentation and run its consistency check, existing provider
   tests, and workspace type checking.

The current refactor adds no tests or examples and preserves all existing test
assertions and snapshots.
