# Adding a new model

1. For providers with a model catalog, add the model to the corresponding operation's declarations in `packages/<provider>/src/*-model-catalog.ts`. Model ID suggestions are derived from these declarations; do not add a separate model ID union. For operations without catalog entries, update the model ID type in the settings or options file.
1. Run `pnpm generate:model-capabilities-docs` to update catalog-generated capability tables. For tables without a catalog, add the model to the provider page under `/content/providers/...` (Model Capabilities table at the bottom).
1. If the model is notable, add to
   - `content/providers/01-ai-sdk-providers/index.mdx`
   - `content/docs/02-foundations/02-providers-and-models.mdx`
1. PR with changeset
1. NPM publish through Changesets PR

Example PR: https://github.com/vercel/ai/pull/7313
