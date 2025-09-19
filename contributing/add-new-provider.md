# Add new provider

Example: https://github.com/vercel/ai/pull/8136/files

1. Create new folder `packages/<provider>`
2. Set version in `packages/<provider>/package.json` to `0.0.0`
3. Create changeset for new package with `major`
4. Add examples to `examples/ai-core/src/*/<provider>.ts` depending on what model types the provider supports
5. Add documentation in `content/providers/01-ai-sdk-providers/<last number + 10>-<provider>.mdx`