---
fileMatcher:
  - 'packages/*/README.md'
  - '!packages/ai/README.md'
  - '!packages/codemod/README.md'
  - '!packages/provider-utils/README.md'
  - '!packages/provider/README.md'
---

# Package README Guidelines

Guidelines for creating and editing public packages' `README.md` files.

## README-1: Use a consistent readme headline for the package

- **Severity**: blocker
- **Sources**: PR #23939, PR #24114

Use a single h1 headline as first line of the `README.md` file, with a descriptive package title prefixed with `# AI SDK - `.

Example:

```md
# AI SDK - OpenAI Provider
```

## README-2: Follow the readme headline with a concise package description

- **Severity**: blocker
- **Sources**: PR #23939

After the `README.md` headline, follow with a 1-2 sentence package description in a single paragraph.

You _may_ follow this paragraph with an optional note about compatibility, AI Gateway, or experimental nature. Consult similar packages and match their formatting; if in doubt, _do not_ add one.

Example:

```md
The **[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access OpenAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).
```

## README-3: Include only specific sections in each readme

- **Severity**: blocker
- **Sources**: PR #23939

After the `REAMDE.md` headline, description, and optional note, include _only_ the following sections, in this order:

1. `## Setup` (required): only one fenced, one-line `npm i` command for the package, including necessary related packages.
2. `## Skill for Coding Agents` (optional): section between `## Setup` and `## Usage`, with a short recommendation and one fenced shell command to add the AI SDK skill to the repository. It must always have the exact same content across readmes.
3. `## Usage` (required): only one fenced, basic getting-started code example for the package (TypeScript or a framework component with TypeScript), followed by a suitable `https://ai-sdk.dev/...` docs link using `See the [<package title> documentation](<url>) for more information.` If no single docs link clearly fits, use 1–2 related docs links with custom phrasing.

Template to follow:

````md
## Setup

```bash
npm i <npm-package>
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { example } from '<npm-package>';

await example();
```

See the [<package title> documentation](https://ai-sdk.dev/...) for more information.
````
