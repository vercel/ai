# Contributing Resources

The AI SDK site includes community resources that help developers find tools,
examples, and production applications built with the SDK. This page explains how
to contribute to each resource.

## Tool Registry

The tool registry lists npm packages that expose AI SDK tools.

Before adding a tool, make sure that it is:

- Published to npm.
- Documented with clear installation and usage instructions.
- Tested with the current AI SDK.
- Useful as a reusable tool, not only as a one-off application example.

To add a tool, update `content/tools-registry/registry.ts`. Add a new entry to
the `tools` array with a unique `slug`, package metadata, install commands, and a
working `codeExample`.

Use the detailed tool registry guide for the complete entry shape and PR format:
[AI SDK Tools Registry - Contributing a Tool](./add-new-tool-to-registry.md).

## Recipes

Recipes are practical examples that show how to solve a specific problem with
the AI SDK. They live in `content/cookbook`.

Create a new `.mdx` file in the relevant category and add frontmatter:

```yaml
---
title: My Recipe Title
description: One sentence describing what the recipe helps users build.
tags: ['next', 'agent', 'tools']
author:
  name: Jane Doe
  github: janedoe
---
```

Use `author.name` for the display name and `author.github` for the GitHub
username. If `author` is omitted, the recipe is attributed to the Vercel Team.

A good recipe should:

- Solve one specific AI SDK use case.
- Include runnable, copyable code.
- Name required packages and environment variables.
- Prefer minimal working examples over app-specific abstractions.
- Explain the important decisions, not every line of code.
- Use tags that match existing recipes where possible, such as `next`, `node`,
  `agent`, `tool use`, `streaming`, `structured data`, or `retrieval`.

For example:

```yaml
---
title: Slackbot Agent
description: Build a Slackbot that can answer questions and call tools.
tags: ['node', 'agent', 'tool use']
author:
  name: Jane Doe
  github: janedoe
---
```

When adding a recipe:

1. Create a new `.mdx` file in the relevant cookbook directory.
2. Use a focused title that describes the task, such as `Slackbot Agent`,
   `Stream Text with Image Prompt`, or `Call Tools in Multiple Steps`.
3. Include complete code snippets with filenames where appropriate.
4. Prefer current AI SDK APIs and import patterns. Import core functions from
   `ai` and providers from `@ai-sdk/<provider>`.
5. Update the section index file if the cookbook navigation for that section
   requires it.

Keep recipes narrow. A recipe should teach one task end to end. If the topic
needs multiple stages, use the guide section instead of a short framework recipe.

## Pull Request Checklist

Before opening a pull request for a resource contribution:

- Follow the setup instructions in the root [CONTRIBUTING.md](../CONTRIBUTING.md).
- Match the structure and tone of nearby entries.
- Run `pnpm fix` if you changed formatted files.
- Run a targeted check when your change touches TypeScript, such as the tool
  registry.
- Use a `docs:` PR title for documentation-only changes.
- Use `feat(tools-registry): add <tool-name>` when adding a tool registry entry.
