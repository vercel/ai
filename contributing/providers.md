# Provider Development Notes

## Provider Options Schemas

Provider options schemas are user facing.
We want them to be as restrictive as possible, so that we have more flexibility with future changes and allow for meaningful `null` values.

- use `.optional()` unless `null` is meaningful

## Response Schemas

Response schemas need to be flexible enough to deal with provider API changes that do not affect our processing
to prevent unnecessary breakages.

- keep them minimal (no unused properties)
- use `.nullish()` instead of `.optional()`

## Provider-Specific Model Options Types

Types and Zod schemas for the provider specific model options follow the pattern `{Provider}{ModelType}Options`, e.g. `AnthropicLanguageModelOptions`.
If a provider has multiple implementations for the same model type, add a qualifier: `{Provider}{ModelType}{Qualifier}Options`, e.g. `OpenAILanguageModelChatOptions` and `OpenAILanguageModelResponsesOptions`.

- types are PascalCase, Zod schemas are camelCase (e.g. `openaiLanguageModelChatOptions`)
- types must be exported from the provider package, Zod schemas must not

## Provider Method Names

For the Provider v3 interface, we require fully specified names with a "Model" suffix, e.g. `languageModel(id)` or `imageModel(id)`. These help with clarity for both developers and agents.
