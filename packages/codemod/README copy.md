# AI SDK Codemods

The AI SDK provides automated code transformations (codemods) to help upgrade your codebase when features are deprecated, removed, or changed between versions.

Codemods are transformations that run on your codebase programmatically, allowing you to easily apply many changes without manually editing every file.

## Quick Start

### Run All Codemods (Recommended)

To run all codemods for upgrading to AI SDK 5.0:

```sh
npx @ai-sdk/codemod upgrade
```

This will automatically detect and transform all applicable code patterns in your project.

### Run Individual Codemods

To run a specific codemod:

```sh
npx @ai-sdk/codemod <codemod-name> <path>
```

Examples:
```sh
# Transform a specific file
npx @ai-sdk/codemod remove-experimental-ai-fn-exports src/app/api/chat/route.ts

# Transform a directory
npx @ai-sdk/codemod replace-baseurl src/lib/

# Transform entire project
npx @ai-sdk/codemod rename-format-stream-part .
```

## Available Codemods

### Provider Changes

| Codemod | Description |
|---------|-------------|
| `replace-baseurl` | Replaces `baseUrl` with `baseURL` in provider configurations |
| `remove-anthropic-facade` | Removes deprecated `Anthropic` facade, use `createAnthropic()` instead |
| `remove-google-facade` | Removes deprecated `Google` facade, use `createGoogleGenerativeAI()` instead |
| `remove-mistral-facade` | Removes deprecated `Mistral` facade, use `createMistral()` instead |
| `remove-openai-facade` | Removes deprecated `OpenAI` facade, use `createOpenAI()` instead |

### Core API Changes

| Codemod | Description |
|---------|-------------|
| `remove-experimental-ai-fn-exports` | Removes experimental AI function exports that are no longer available |
| `remove-deprecated-provider-registry-exports` | Removes deprecated provider registry exports |
| `replace-continuation-steps` | Replaces continuation steps with new step-based API |
| `replace-roundtrips-with-maxsteps` | Replaces roundtrip parameters with `maxSteps` |
| `replace-token-usage-types` | Updates token usage type references to new structure |

### Streaming and Response Changes

| Codemod | Description |
|---------|-------------|
| `remove-ai-stream-methods-from-stream-text-result` | Removes deprecated streaming methods from `streamText` results |
| `rename-format-stream-part` | Renames `formatStreamPart` to new naming convention |
| `rename-parse-stream-part` | Renames `parseStreamPart` to new naming convention |
| `remove-experimental-streamdata` | Removes `experimental_StreamData`, use `StreamData` instead |

### UI Framework Changes

| Codemod | Description |
|---------|-------------|
| `rewrite-framework-imports` | Rewrites framework imports (Svelte, Vue, Solid) to use dedicated packages |
| `remove-experimental-useassistant` | Removes experimental `useAssistant` exports |
| `remove-experimental-message-types` | Removes experimental message type exports |
| `remove-experimental-tool` | Removes experimental tool exports |

### Utility and Helper Changes

| Codemod | Description |
|---------|-------------|
| `replace-nanoid` | Replaces `nanoid` export with `generateId` |
| `replace-langchain-toaistream` | Updates LangChain streaming integration |
| `remove-metadata-with-headers` | Removes deprecated metadata with headers pattern |
| `remove-isxxxerror` | Removes deprecated `isXxxError` functions |
| `remove-await-streamobject` | Removes deprecated `await` patterns from `streamObject` |
| `remove-await-streamtext` | Removes deprecated `await` patterns from `streamText` |

## CLI Options

### Global Options

```sh
npx @ai-sdk/codemod [options] <codemod-name> <path>
```

- `--dry-run` - Preview changes without applying them
- `--print` - Print transformed code to stdout
- `--verbose` - Show detailed transformation logs

### Examples

```sh
# Preview changes without applying
npx @ai-sdk/codemod --dry-run upgrade

# Show verbose output
npx @ai-sdk/codemod --verbose remove-experimental-ai-fn-exports src/

# Print transformed code
npx @ai-sdk/codemod --print replace-baseurl src/config.ts
```

## Best Practices

### Before Running Codemods

1. **Backup your code** - Commit all changes to version control
2. **Review current deprecation warnings** - Fix any obvious issues first
3. **Update dependencies** - Ensure you're on the target AI SDK version

### After Running Codemods

1. **Review changes** - Check the diff to understand what was transformed
2. **Test your application** - Ensure everything works as expected
3. **Handle edge cases** - Some complex patterns may need manual fixes
4. **Run type checking** - Fix any TypeScript errors that remain

### Troubleshooting

If a codemod doesn't transform some code:

1. **Check file extensions** - Codemods work on `.ts`, `.tsx`, `.js`, `.jsx` files
2. **Review patterns** - Complex or unusual code patterns may need manual updates
3. **Run specific codemods** - Try running individual codemods for targeted fixes
4. **Check documentation** - Some changes may not have automated codemods

## Contributing

### Adding New Codemods

1. Create the codemod in `src/codemods/`
2. Add test fixtures in `src/test/__testfixtures__/`
3. Create tests in `src/test/`
4. Update the bundle in `src/lib/upgrade.ts`

### Testing Codemods

```sh
# Run all tests
pnpm test

# Run specific codemod tests
pnpm test <codemod-name>

# Test in development
pnpm test:watch
```

## Support

- **Documentation**: [AI SDK Migration Guides](https://ai-sdk.dev/docs/migration-guides)
- **Issues**: [GitHub Issues](https://github.com/vercel/ai/issues)
- **Community**: [Discord](https://discord.gg/vercel)

## Version Compatibility

- **AI SDK 5.0**: All codemods in this package
- **AI SDK 4.x**: Use `@ai-sdk/codemod@1.x`
- **AI SDK 3.x**: Manual migration required

---

For more detailed migration information, see the [AI SDK 5.0 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0).
