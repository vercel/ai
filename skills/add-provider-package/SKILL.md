---
name: add-provider-package
description: Guide for adding first-party AI provider packages to the AI SDK. Use when creating a provider package under packages/ to integrate an external AI service.
metadata:
  internal: true
---

# Add a Provider Package

Add a complete first-party `@ai-sdk/<provider>` package that follows the current provider interfaces, repository conventions, security requirements, and release process.

## Read the Current Sources of Truth

Before implementing anything, read:

- [Add new provider](../../contributing/add-new-provider.md) for current package and release requirements
- [Provider development notes](../../contributing/providers.md) for naming, schemas, and workflow serialization
- [Provider architecture](../../contributing/provider-architecture.md) for the provider abstraction
- [Secure URL handling](../../contributing/secure-url-handling.md) when the provider fetches polling, image, audio, video, or other URLs

Use [PR #18595](https://github.com/vercel/ai/pull/18595/changes) as a recent end-to-end example, but choose the current provider package whose API shape and model types most closely resemble the new provider as the implementation reference.

Third parties can publish provider packages outside this repository. A new first-party `@ai-sdk/<provider>` package requires prior discussion in an issue. Confirm that agreement exists before implementing the package.

## Discover the API Contract

Before designing model classes, look for an official, versioned OpenAPI or Swagger specification in the provider's documentation or repositories. Prefer first-party specifications and record the source URL plus its version, publication date, or commit in the implementation notes or pull request.

Use the specification and official documentation to identify:

- base URLs and authentication schemes
- supported endpoints, model types, and capabilities
- request parameters and response shapes
- streaming transports and event formats
- error response envelopes
- asynchronous polling and download URL flows

Treat an OpenAPI specification as implementation evidence, not unquestioned truth. Specifications are often incomplete for server-sent events, streaming deltas, polymorphic content, tool calls, nullable fields, and errors. Do not add a generated client or generated production types by default. Implement minimal hand-written types and Zod schemas, then verify them against official documentation and captured API responses.

If no official specification exists, derive the contract from official documentation and real response fixtures, and note that limitation in the pull request.

## Plan the Provider Shape

Determine which AI SDK model interfaces the provider supports, such as `LanguageModelV4`, `EmbeddingModelV4`, `ImageModelV4`, `SpeechModelV4`, `TranscriptionModelV4`, `RerankingModelV4`, or `Experimental_VideoModelV4`.

Before introducing a dependency, public API pattern, or new abstraction, read `contributing/decisions/README.md` and relevant accepted ADRs. Prefer existing provider utilities and implementation patterns.

## Scaffold the Package

Create `packages/<provider>/` by adapting a current, comparable provider package. A typical package contains:

```text
packages/<provider>/
├── src/
│   ├── index.ts
│   ├── version.ts
│   ├── <provider>-provider.ts
│   ├── <provider>-provider.test.ts
│   ├── <provider>-<model-type>-model.ts
│   ├── <provider>-<model-type>-model.test.ts
│   └── <provider>-<model-type>-options.ts
├── CHANGELOG.md
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── turbo.json
├── vitest.node.config.js
└── vitest.edge.config.js
```

Preserve current package conventions rather than recreating configuration from memory:

- Set the repository package version to exactly `2.0.0`, with no prerelease suffix.
- Create `CHANGELOG.md` with an initial `# @ai-sdk/<provider>` heading.
- Use ESM output and the current `tsup` package-version injection pattern.
- Extend `./node_modules/@vercel/ai-tsconfig/ts-library.json`, enable a composite project, and add package references for workspace dependencies.
- Include the standard build, clean, type-check, Node test, and Edge test scripts.
- Include the standard `files`, documentation prepack, repository, bugs, engines, and public provenance publishing metadata.
- Use `workspace:*` for AI SDK workspace dependencies. Add `@ai-sdk/test-server` only when tests use it.
- Support the repository's Zod 3 and Zod 4 peer dependency range and use `zod/v4` for new implementation schemas.

Run `pnpm update-references` after adding or changing workspace dependencies.

## Implement the Provider Factory

Follow the current provider factory pattern:

- Define a provider interface that extends `ProviderV4`.
- Export `create<Provider>(settings)` and a default provider instance.
- Make the provider callable when it has a meaningful default model type and comparable providers follow that pattern; otherwise return a provider object.
- Set `provider.specificationVersion = 'v4'`.
- Implement the fully specified factory methods required by `ProviderV4`, such as `languageModel`, `embeddingModel`, and `imageModel`.
- Add short aliases such as `chat`, `embedding`, or `image` only when they improve the provider's API.
- Throw `NoSuchModelError` from unsupported required model factories.
- Support provider-appropriate settings such as `apiKey`, `baseURL`, `headers`, and a custom `fetch` implementation.
- Load credentials with `loadApiKey` or the appropriate shared utility, normalize configurable base URLs, and include the package version in the user-agent suffix.
- Export the provider factory, default instance, public option types, model ID types, and `VERSION` from `src/index.ts`.

## Implement Model Classes

Implement each supported model using the appropriate interface from `@ai-sdk/provider` and shared utilities from `@ai-sdk/provider-utils`.

Provider option types and schemas must follow [the repository naming and export rules](../../contributing/providers.md#provider-specific-model-options-types). User-facing option fields should use `.optional()` unless `null` is meaningful. Response schemas should be minimal, tolerate unused provider fields, and use `.nullish()` where the API may omit or return `null`.

All model classes must implement the workflow serialization contract described in [Provider development notes](../../contributing/providers.md#workflow-serialization):

- make model configuration headers optional
- add `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods
- use `serializeModel`, `serializeModelOptions`, or the matching existing pattern
- ensure authentication and other non-serializable functions can be restored from request options or the workflow environment

## Handle Responses, Errors, and URLs Safely

- Never use `JSON.parse` in production code. Use `parseJSON` or `safeParseJSON` from `@ai-sdk/provider-utils`.
- Validate successful and failed responses with minimal schemas and shared response handlers such as `createJsonResponseHandler` and `createJsonErrorResponseHandler`.
- Introduce a custom `AISDKError` subclass only when the package needs a new public SDK error type; ordinary provider HTTP failures should use the shared API error handling.
- Set `validateUrl` explicitly on every `getFromApi` call.
- Use `validateUrl: true` when the URL host or scheme comes from a provider response, and `false` when it is derived from a developer-configured base URL.
- Use `trustedOrigin` for legitimate response URLs that may point to a configured private or self-hosted endpoint.
- Use `credentialedOrigin` when credentials may be sent on the first hop, so they are withheld from off-origin URLs and redirects.

Read [Secure URL handling](../../contributing/secure-url-handling.md) before implementing any polling or provider-supplied download URL flow.

## Test Against the Real Contract

Add focused tests for:

- provider defaults, custom settings, factory aliases, and unsupported model types
- request serialization and response parsing
- streaming events, usage, finish reasons, warnings, tool calls, and provider metadata where supported
- error response parsing and malformed responses
- workflow serialization and deserialization
- URL trust decisions for polling or downloads
- both Node.js and Edge runtimes

Use real provider responses as fixtures when practical. Read the [capture API response fixture skill](../capture-api-response-test-fixture/SKILL.md) before capturing them. Trim oversized fixtures only when doing so does not change their semantics.

## Add Examples and Repository Integration

Read the [AI Functions example skill](../develop-ai-functions-example/SKILL.md) before adding examples.

For each supported model type, put the entry example at:

```text
examples/ai-functions/src/<function>/<provider>/basic.ts
```

Put additional examples in the same provider directory with descriptive `kebab-case.ts` names. Do not create flat provider files such as `src/generate-text/<provider>.ts`.

Also update the relevant repository integration points:

- add `@ai-sdk/<provider>` to `examples/ai-functions/package.json`
- add its project reference to `examples/ai-functions/tsconfig.json`
- add required credentials to `examples/ai-functions/.env.example`
- add credential names to the root `turbo.json` environment configuration when needed
- run `pnpm update-references` to update root and package TypeScript references

Run representative examples against the real API and confirm both non-streaming and streaming behavior when supported.

## Add Package and Provider Documentation

- Write the package `README.md` with installation, authentication, configuration, supported models, and basic usage.
- Add `content/providers/01-ai-sdk-providers/<last number + 10>-<provider>.mdx` with setup, model capabilities, provider options, and examples.
- Configure the package's documentation prepack script to include that provider page.

## Prepare the Release

Create a major changeset for the new provider package. The repository package remains at plain `2.0.0`; do not add `-beta`, `-canary`, or another prerelease suffix.

Before the first automated release, coordinate with the Vercel IT team to bootstrap an empty `@ai-sdk/<provider>` package on npm at `0.0.0` and configure its Trusted Publisher. Follow [Bootstrapping a new `@ai-sdk/*` package](../../contributing/releases.md#bootstrapping-a-new-ai-sdk-package). The temporary npm bootstrap version is separate from the repository package version.

When `main` is in prerelease mode, do not backport the new package to a stable `vX.Y` branch.

## Verify the Complete Change

Run, at minimum:

```bash
pnpm --filter @ai-sdk/<provider> build
pnpm --filter @ai-sdk/<provider> test
pnpm --filter @ai-sdk/<provider> type-check
pnpm type-check:full
pnpm check
```

Also run the new examples with the required provider credentials. Run the root build when changes to shared packages or build configuration make it relevant.

## Completion Checklist

- [ ] First-party package approved in an issue
- [ ] Official OpenAPI specification reviewed, or its absence documented
- [ ] API specification checked against documentation and real responses
- [ ] Comparable current provider implementation selected
- [ ] Repository package created at version `2.0.0`
- [ ] Package, TypeScript, build, test, provenance, and documentation configuration added
- [ ] Provider factory implements `ProviderV4`
- [ ] Supported model classes and public option types implemented
- [ ] Workflow serialization implemented for every model class
- [ ] Response parsing, error handling, and URL fetching follow repository security rules
- [ ] Node and Edge tests pass with representative response fixtures
- [ ] Nested AI Functions examples added and run successfully
- [ ] Example dependencies, TypeScript references, environment variables, and Turbo configuration updated
- [ ] README and provider documentation added
- [ ] Major changeset added
- [ ] npm package and Trusted Publisher bootstrap coordinated
- [ ] Package build, tests, full type check, and repository checks pass
