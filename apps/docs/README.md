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

## Microfrontends group

The `ai-sdk-docs` project is a child application in the `ai-sdk`
microfrontends group. Its project settings must use `/docs` as the default
route. The application key and the package name are both `ai-sdk-docs`, so the
group configuration must not include a `packageName` override.

Route these path families to `ai-sdk-docs`:

- `/v4/:path*`
- `/v5/:path*`
- `/v6/:path*`
- `/v7/:path*`
- `/docs/:path*`
- `/cookbook/:path*`
- `/providers/:path*`
- `/resources/:path*`
- `/api/chat`
- `/api/search`
- `/llms.txt`
- `/llms.mdx/:path*`
- `/sitemap.md`
- `/sitemap.xml`
- `/robots.txt`
- `/og/:path*`
- `/tools-registry/:path*`
- `/showcase`
- `/examples/:path*`
- `/elements/:path*`
- `/model-library`

The default application continues to serve unmatched routes, including `/`
and `/playground`. `microfrontends.ci.json` mirrors the group configuration for
GitHub Actions, which cannot pull the Vercel-managed configuration during a
build; keep the two configurations in sync.

## Archiving unsupported versions

Documentation for an unsupported major version should not be added to this
application when doing so would exceed the build's memory budget. Instead:

1. Deploy the final documentation snapshot as a separate static project on a
   versioned subdomain such as `v4.ai-sdk.dev`.
2. Add a site-wide unsupported-version banner that links to the next major
   version's migration guide.
3. Redirect the version prefix from this application to the archive subdomain,
   preserving the remainder of the path.
4. Keep the version prefix delegated to `ai-sdk-docs` in the microfrontends
   group so these redirects execute.

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
