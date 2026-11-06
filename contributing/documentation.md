# Documentation

## Making Changes

To make changes to the documentation website (https://ai-sdk.dev), modify files in the `/content` directory. Please follow conventions of similar files.

To preview documentation changes locally, use Node.js 22 or newer and run these commands from the repository root:

```bash
pnpm install
pnpm --filter ai-sdk-docs dev:site
```

The development command syncs `content/docs/` into the documentation app before starting the local site. See the [documentation app README](../apps/docs/README.md#local-development) for more details.

## Pull Request Guidelines

All documentation PRs should be prefixed with `docs:` in the title.

Run `npm run fix` to solve formatting issues.

## Update Schedule

Documentation is sourced and updated every 3 hours on the live site.
