# AI SDK docs

This is the package-backed Geistdocs application for `ai-sdk.dev`.

## Local development

Use Node.js 22 or newer from the repository root:

```bash
pnpm install
pnpm --filter ai-sdk-docs dev:site
```

The content sync generates `apps/docs/content/` from three reviewed sources:

- v7 documentation from this checkout's `content/docs/` directory.
- v6 documentation from the commit pinned in
  `scripts/sync-content.mjs`.
- v5 documentation from the commit pinned in
  `scripts/sync-content.mjs`.

Generated content, Fumadocs source files, and Next.js output are ignored by
Git. Run the complete local validation with:

```bash
pnpm --filter ai-sdk-docs validate:site
```

## Vercel project

The Vercel project must use:

- Root Directory: `apps/docs`
- Include source files outside the Root Directory: enabled
- Node.js: a version supported by the repository

The outside-root setting is required because the content sync reads the
repository's `content/docs/` directory and Git metadata.

Edit-source links remain disabled until the `NN-` filename codemod lands on
`main` (page paths don't match source paths yet). Playground and
getting-started links continue to the existing production site while those
route families remain outside this application; the resources family
(recipes, tools registry, templates, showcase) is served by this
application, and legacy URLs such as `/tools-registry`, `/showcase`,
`/examples`, `/elements`, and `/model-library` redirect the same way
production does.

Feedback and markdown-request tracking go through the Geistdocs platform,
labeled with the `siteId` exported from `geistdocs.tsx`. Social cards are
rendered by `app/[lang]/og/[...slug]/route.tsx`, which serves both the
Geistdocs URL shape (`/og/<slugs>/image.png`) and the legacy production
shape (`/og/docs?title=…&description=…`).

Mirroring production, every cookbook recipe is served on two URL surfaces:
`/cookbook/...` and `/resources/recipes/...`. The sitemap, llms.txt, and
search canonicalize on `/cookbook`.

## Third-party logos

`public/images/icons/` contains third-party provider logos used nominatively
on the provider index pages, `public/images/showcase/` contains product
screenshots and logos for the showcase page, and
`components/docs/upsell.tsx` inlines customer logos (all ported from the
previous ai-sdk.dev app). The marks belong to their respective owners and
are not covered by this repository's license.
