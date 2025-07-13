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
| `flatten-streamtext-file-properties`               | Transforms flatten streamtext file properties     |
| `migrate-to-data-stream-protocol-v2`               | Transforms migrate to data stream protocol v2     |
| `remove-ai-stream-methods-from-stream-text-result` | Removes ai stream methods from stream text result |
| `remove-await-streamobject`                        | Removes await streamobject                        |
| `remove-await-streamtext`                          | Removes await streamtext                          |
| `remove-experimental-streamdata`                   | Removes experimental streamdata                   |
| `rename-datastream-transform-stream`               | Renames datastream transform stream               |
| `rename-format-stream-part`                        | Renames format stream part                        |
| `rename-parse-stream-part`                         | Renames parse stream part                         |
| `replace-content-with-parts`                       | Replaces content with parts                       |
| `replace-langchain-toaistream`                     | Replaces langchain toaistream                     |
| `replace-simulate-streaming`                       | Replaces simulate streaming                       |
| `restructure-file-stream-parts`                    | Transforms restructure file stream parts          |
| `restructure-source-stream-parts`                  | Transforms restructure source stream parts        |

### UI Framework Changes

| Codemod                             | Description                        |
| ----------------------------------- | ---------------------------------- |
| `move-ui-utils-to-ai`               | Transforms move ui utils to ai     |
| `remove-experimental-message-types` | Removes experimental message types |
| `remove-experimental-tool`          | Removes experimental tool          |
| `remove-experimental-useassistant`  | Removes experimental useassistant  |
| `remove-get-ui-text`                | Removes get ui text                |
| `rename-message-to-ui-message`      | Renames message to ui message      |
| `rewrite-framework-imports`         | Rewrites framework imports         |

### Utility and Helper Changes

| Codemod                                           | Description                                             |
| ------------------------------------------------- | ------------------------------------------------------- |
| `import-LanguageModelV2-from-provider-package`    | Transforms import LanguageModelV2 from provider package |
| `move-image-model-maxImagesPerCall`               | Transforms move image model maxImagesPerCall            |
| `move-langchain-adapter`                          | Transforms move langchain adapter                       |
| `move-provider-options`                           | Transforms move provider options                        |
| `move-react-to-ai-sdk`                            | Transforms move react to ai sdk                         |
| `remove-experimental-wrap-language-model`         | Removes experimental wrap language model                |
| `remove-isxxxerror`                               | Removes isxxxerror                                      |
| `remove-metadata-with-headers`                    | Removes metadata with headers                           |
| `remove-openai-compatibility`                     | Removes openai compatibility                            |
| `remove-sendExtraMessageFields`                   | Removes sendExtraMessageFields                          |
| `rename-core-message-to-model-message`            | Renames core message to model message                   |
| `rename-languagemodelv1providermetadata`          | Renames languagemodelv1providermetadata                 |
| `rename-max-tokens-to-max-output-tokens`          | Renames max tokens to max output tokens                 |
| `rename-mime-type-to-media-type`                  | Renames mime type to media type                         |
| `rename-reasoning-properties`                     | Renames reasoning properties                            |
| `rename-reasoning-to-reasoningText`               | Renames reasoning to reasoningText                      |
| `rename-request-options`                          | Renames request options                                 |
| `replace-bedrock-snake-case`                      | Replaces bedrock snake case                             |
| `replace-experimental-provider-metadata`          | Replaces experimental provider metadata                 |
| `replace-generatetext-text-property`              | Replaces generatetext text property                     |
| `replace-image-type-with-file-type`               | Replaces image type with file type                      |
| `replace-llamaindex-adapter`                      | Replaces llamaindex adapter                             |
| `replace-nanoid`                                  | Replaces nanoid                                         |
| `replace-oncompletion-with-onfinal`               | Replaces oncompletion with onfinal                      |
| `replace-provider-metadata-with-provider-options` | Replaces provider metadata with provider options        |
| `replace-rawresponse-with-response`               | Replaces rawresponse with response                      |
| `replace-redacted-reasoning-type`                 | Replaces redacted reasoning type                        |
| `replace-textdelta-with-text`                     | Replaces textdelta with text                            |
| `replace-usage-token-properties`                  | Replaces usage token properties                         |
| `rsc-package`                                     | Transforms rsc package                                  |

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
