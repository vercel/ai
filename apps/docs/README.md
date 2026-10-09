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

To run the versioned-search browser regression, start the docs server on port
3217, then run the test from the repository root (requires Playwright Chromium):

```bash
pnpm --filter ai-sdk-docs dev:site --port 3217
node --test apps/docs/scripts/search.e2e.mjs
```

Set `DOCS_TEST_URL` to test another local or preview server. The test switches
versions through the UI and checks the search API's explicit version scopes.

## Vercel project

The Vercel project must use:

- Root Directory: `apps/docs`
- Include source files outside the Root Directory: enabled
- Node.js: a version supported by the repository

The outside-root setting is required because the content sync reads the
repository's `content/docs/` directory and Git metadata.

Edit-source links remain disabled until the `NN-` filename codemod lands on
`main` (page paths don't match source paths yet). Playground links use hard
navigation to `playground.ai-sdk.dev`; legacy playground pages and read-only
resources redirect there, while retired mutation endpoints return `410 Gone`.
The resources family (recipes, tools registry, templates, showcase) is served
by this application. Legacy documentation and resource URLs preserve the
production redirect contract.

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
screenshots and logos for the showcase page,
`components/docs/framework-icons.tsx` inlines framework marks for the
getting-started cards, and `components/docs/upsell.tsx` inlines customer
logos (all ported from the previous ai-sdk.dev app). The marks belong to
their respective owners and are not covered by this repository's license.
The public-domain paintings in `public/images/*.jpg` illustrate the
generative UI demos.

## Landing page

`components/home/` restores the landing page from `vercel/ai-studio`
(`8bf26cccd9d29f65460435388b25f170bbbb0fb1`), using the public Geistdocs
controls in a full-width layout that aligns with the navbar (following
flags-sdk.dev and vercel.com/ai-sdk). The existing site layout supplies
navigation, search, Ask AI, analytics, and the footer. Framework and model
provider marks come from the Geistdocs logo assets (vendored from
`@vercel/geistcn-assets`); the testimonial wordmarks in
`components/home/company-logos.tsx` are copied from the same package. All are
third-party logos covered by the notice above.

The demos display example code and prerecorded media; they do not make AI
generation requests. The hero demo in `components/home/hero-interactive/` is
the original interactive section (simulated generation progress, custom audio
player, animated transcription and provider carousel) and uses `motion`.
The Core/UI section in `components/home/code-examples/` mirrors the one on
vercel.com/ai-sdk, with a live preview for each example and a Code view.
Image/video previews and the social card use the existing public Blob store,
and speech uses the original ElevenLabs audio sample.
Stats are cached hourly and fall back to conservative counts if public npm or
GitHub requests fail. Starter prompts live in `lib/home/prompt-templates.ts`.

After updating examples, validate the displayed strings against the current
workspace SDK (in addition to the normal site validation):

```bash
pnpm --filter ai-sdk-docs exec node scripts/home-examples.typecheck.mjs
```
