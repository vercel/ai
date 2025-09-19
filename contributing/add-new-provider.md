# Add new provider

## `@ai-sdk/<provider>` vs 3rd party package

Every provider is welcome to create a 3rd party package. We are happy to link to it from our documentation.

If you would prefer a 1st party `@ai-sdk/<provider>` package, the decision comes usually down to whether the Vercel AI Gateway will support the provider or not. If AI Gateway is or will support the provider, we prefer the provider package to be part of the `vercel/ai` repository.

## Example

https://github.com/vercel/ai/pull/8136/files

## How

1. Create new folder `packages/<provider>`
2. Set version in `packages/<provider>/package.json` to `0.0.0`
3. Create changeset for new package with `major`
4. Add examples to `examples/ai-core/src/*/<provider>.ts` depending on what model types the provider supports
5. Add documentation in `content/providers/01-ai-sdk-providers/<last number + 10>-<provider>.mdx`

See also [providers.md](providers.md)
