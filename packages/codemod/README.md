# AI SDK Codemods

The **[AI SDK Codemods](https://ai-sdk.dev/docs/migration-guides)** provide automated code transformations to help upgrade your codebase when features are deprecated, removed, or changed between versions.

## Setup

The AI SDK Codemods are available in the `@ai-sdk/codemod` module. You can run them with

```bash
npx @ai-sdk/codemod upgrade
```

## Usage

You can run all codemods for upgrading to AI SDK 5.0:

```bash
npx @ai-sdk/codemod upgrade
```

Individual codemods can be run by specifying the name of the codemod:

```bash
npx @ai-sdk/codemod <codemod-name> <path>
```

## Example

```bash
# Run all codemods for AI SDK 5.0 migration
npx @ai-sdk/codemod upgrade

# Run a specific codemod
npx @ai-sdk/codemod remove-experimental-ai-fn-exports src/

# Preview changes without applying them
npx @ai-sdk/codemod upgrade --dry-run
```

## Documentation

Please check out the **[AI SDK Migration Guides](https://ai-sdk.dev/docs/migration-guides)** for more information.
