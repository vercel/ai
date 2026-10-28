---
name: edit-package-readme
description: Create or edit package README.md files in the AI SDK monorepo.
metadata:
  internal: true
---

# Package READMEs

Keep `README.md` files minimal; they must not contain documentation beyond simple starting points. Detailed documentation belongs exclusively in `content/` and lives under `https://ai-sdk.dev/docs`.

Every package `README.md` file must contain the following, in the given order:

1. An H1 on the first line that starts with `# AI SDK - `, followed by a descriptive package title rather than its npm identifier.
2. A 1–2 sentence description.
3. Optional note about compatibility, AI Gateway, or experimental nature. Consult similar packages and match their formatting; if in doubt, do not add one.
4. `## Setup`: only one fenced, one-line `npm i` command, including necessary related packages.
5. Optional `## Skill for Coding Agents` section between `## Setup` and `## Usage`, with a short recommendation and one fenced shell command to add the AI SDK skill to the repository.
6. `## Usage`: only one fenced, basic getting-started code example (TypeScript or a framework component with TypeScript).
7. A suitable docs link using `See the [<package title> documentation](<url>) for more information.` If none clearly fits, use 1–2 related docs links with custom phrasing.

You must not include anything else in the readme. Any additional documentation belongs in `content/`.

## Template

Omit the optional note and `## Skill for Coding Agents` section when they do not apply.

````markdown
# AI SDK - <Package Title>

A brief description of the package.

-> **Note**: <Optional compatibility or experimental notice.>

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

## Exceptions

These packages have special-case `README.md` files and do not follow this format:

- `ai`
- `codemod`
- `provider-utils`
- `provider`

Never consult these files for which `README.md` conventions to follow.

## Verification

Run the verification script to ensure all `README.md` files adhere to the conventions:

```bash
./tools/verify-package-readme-files.mjs
```

If this script shows errors, you must address them, then rerun the verification script until it passes.
