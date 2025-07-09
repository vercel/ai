# AI SDK Codemods

The AI SDK provides automated code transformations (codemods) to help upgrade your codebase when features are deprecated, removed, or changed between versions.

Codemods are transformations that run on your codebase programmatically, allowing you to easily apply many changes without manually editing every file.

## Quick Start

### Run All Codemods (Recommended)

To run all codemods:

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

| Codemod                   | Description              |
| ------------------------- | ------------------------ |
| `remove-anthropic-facade` | Removes anthropic facade |
| `remove-google-facade`    | Removes google facade    |
| `remove-mistral-facade`   | Removes mistral facade   |
| `remove-openai-facade`    | Removes openai facade    |
| `replace-baseurl`         | Replaces baseurl         |

### Core API Changes

| Codemod                                       | Description                                  |
| --------------------------------------------- | -------------------------------------------- |
| `remove-deprecated-provider-registry-exports` | Removes deprecated provider registry exports |
| `remove-experimental-ai-fn-exports`           | Removes experimental ai fn exports           |
| `replace-continuation-steps`                  | Replaces continuation steps                  |
| `replace-roundtrips-with-maxsteps`            | Replaces roundtrips with maxsteps            |
| `replace-token-usage-types`                   | Replaces token usage types                   |

### Streaming and Response Changes

| Codemod                                            | Description                                       |
| -------------------------------------------------- | ------------------------------------------------- |
| `remove-ai-stream-methods-from-stream-text-result` | Removes ai stream methods from stream text result |
| `remove-await-streamobject`                        | Removes await streamobject                        |
| `remove-await-streamtext`                          | Removes await streamtext                          |
| `remove-experimental-streamdata`                   | Removes experimental streamdata                   |
| `rename-format-stream-part`                        | Renames format stream part                        |
| `rename-parse-stream-part`                         | Renames parse stream part                         |
| `replace-langchain-toaistream`                     | Replaces langchain toaistream                     |

### UI Framework Changes

| Codemod                             | Description                        |
| ----------------------------------- | ---------------------------------- |
| `remove-experimental-message-types` | Removes experimental message types |
| `remove-experimental-tool`          | Removes experimental tool          |
| `remove-experimental-useassistant`  | Removes experimental useassistant  |
| `rewrite-framework-imports`         | Rewrites framework imports         |

### Utility and Helper Changes

| Codemod                        | Description                   |
| ------------------------------ | ----------------------------- |
| `remove-isxxxerror`            | Removes isxxxerror            |
| `remove-metadata-with-headers` | Removes metadata with headers |
| `replace-nanoid`               | Replaces nanoid               |

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

First, navigate to the codemod directory:

```sh
cd packages/codemod
```

Then run the tests:

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
