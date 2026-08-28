import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';
import { exampleRedirects } from './lib/example-redirects';

const withMDX = createMDX();

const config: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: 'e742qlubrjnjqpp0.public.blob.vercel-storage.com',
        protocol: 'https',
      },
    ],
  },
  redirects: () => [
    // AI SDK 4 is archived separately so it remains available without adding
    // its content families to this app's already memory-intensive build.
    {
      source: '/v4',
      destination: 'https://v4.ai-sdk.dev/docs/introduction',
      permanent: true,
    },
    {
      source: '/v4/:path*',
      destination: 'https://v4.ai-sdk.dev/:path*',
      permanent: true,
    },
    {
      source: '/v7',
      destination: '/',
      permanent: true,
    },
    {
      source: '/v7/:path*',
      destination: '/:path*',
      permanent: true,
    },
    {
      source: '/docs',
      destination: '/docs/introduction',
      permanent: false,
    },
    // Legacy section landing pages (card grids) were folded into their
    // Overview pages; the content sync drops the folder index when an
    // overview sibling exists (see scripts/sync-content-utils.mjs).
    {
      source:
        '/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-harnesses|ai-sdk-ui|ai-sdk-rsc)',
      destination: '/docs/:section/overview',
      permanent: true,
    },
    {
      source:
        '/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-harnesses|ai-sdk-ui|ai-sdk-rsc).md',
      destination: '/docs/:section/overview.md',
      permanent: true,
    },
    {
      source:
        '/v6/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-ui|ai-sdk-rsc)',
      destination: '/v6/docs/:section/overview',
      permanent: true,
    },
    {
      source:
        '/v6/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-ui|ai-sdk-rsc).md',
      destination: '/v6/docs/:section/overview.md',
      permanent: true,
    },
    {
      source:
        '/v5/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-ui|ai-sdk-rsc)',
      destination: '/v5/docs/:section/overview',
      permanent: true,
    },
    {
      source:
        '/v5/docs/:section(foundations|agents|ai-sdk-core|ai-sdk-ui|ai-sdk-rsc).md',
      destination: '/v5/docs/:section/overview.md',
      permanent: true,
    },
    {
      source: '/v6/docs',
      destination: '/v6/docs/introduction',
      permanent: false,
    },
    {
      source: '/v5/docs',
      destination: '/v5/docs/introduction',
      permanent: false,
    },
    {
      source: '/providers',
      destination: '/providers/ai-sdk-providers',
      permanent: false,
    },
    {
      source: '/v6/providers',
      destination: '/v6/providers/ai-sdk-providers',
      permanent: false,
    },
    {
      source: '/v5/providers',
      destination: '/v5/providers/ai-sdk-providers',
      permanent: false,
    },
    // Legacy resource URLs, mirroring production.
    {
      source: '/tools-registry',
      destination: '/resources/tools',
      permanent: true,
    },
    {
      source: '/tools-registry/:slug',
      destination: '/resources/tools/:slug',
      permanent: true,
    },
    {
      source: '/showcase',
      destination: '/resources/showcase',
      permanent: true,
    },
    // /examples and its deep URLs are still linked from docs content; they
    // chain to their cookbook replacements exactly as on production.
    ...exampleRedirects,
    {
      source: '/elements',
      destination: 'https://elements.ai-sdk.dev',
      permanent: true,
    },
    {
      source: '/elements/:path*',
      destination: 'https://elements.ai-sdk.dev/:path*',
      permanent: true,
    },
    {
      source: '/model-library',
      destination: 'https://vercel.com/docs/ai-gateway',
      permanent: true,
    },
    // The cookbook family root mirrors production (ai-sdk.dev/cookbook):
    // the legacy app permanently redirects it to the Recipes landing page.
    ...['', '/v6', '/v5'].flatMap(prefix => [
      {
        source: `${prefix}/cookbook`,
        destination: `${prefix}/resources/recipes`,
        permanent: true,
      },
      // Cookbook section landing pages have no content (the content sync
      // drops their frontmatter-only index.mdx); the legacy app redirects
      // each section to its first recipe.
      ...['/cookbook', '/resources/recipes'].flatMap(family => [
        {
          source: `${prefix}${family}/:section(next|node|rsc)`,
          destination: `${prefix}${family}/:section/generate-text`,
          permanent: false,
        },
        {
          source: `${prefix}${family}/:section(next|node|rsc).md`,
          destination: `${prefix}${family}/:section/generate-text.md`,
          permanent: false,
        },
        {
          source: `${prefix}${family}/api-servers`,
          destination: `${prefix}${family}/api-servers/node-http-server`,
          permanent: false,
        },
        {
          source: `${prefix}${family}/api-servers.md`,
          destination: `${prefix}${family}/api-servers/node-http-server.md`,
          permanent: false,
        },
      ]),
    ]),
    {
      source: '/docs/ai-sdk-core/prompts',
      destination: '/docs/foundations/prompts',
      permanent: true,
    },
    {
      source: '/docs/ai-sdk-core/prompts.md',
      destination: '/docs/foundations/prompts.md',
      permanent: true,
    },
    {
      source: '/v6/docs/ai-sdk-core/prompts',
      destination: '/v6/docs/foundations/prompts',
      permanent: true,
    },
    {
      source: '/v6/docs/ai-sdk-core/prompts.md',
      destination: '/v6/docs/foundations/prompts.md',
      permanent: true,
    },
    {
      source: '/v5/docs/ai-sdk-core/prompts',
      destination: '/v5/docs/foundations/prompts',
      permanent: true,
    },
    {
      source: '/v5/docs/ai-sdk-core/prompts.md',
      destination: '/v5/docs/foundations/prompts.md',
      permanent: true,
    },
    {
      source: '/docs/reference/ai-sdk-core/validate-json-rpc-message',
      destination: '/docs/reference/ai-sdk-core/create-mcp-client',
      permanent: false,
    },
    {
      source: '/docs/reference/ai-sdk-core/validate-json-rpc-message.md',
      destination: '/docs/reference/ai-sdk-core/create-mcp-client.md',
      permanent: false,
    },
    {
      source: '/v6/docs/reference/ai-sdk-core/validate-json-rpc-message',
      destination: '/v6/docs/reference/ai-sdk-core/create-mcp-client',
      permanent: false,
    },
    {
      source: '/v6/docs/reference/ai-sdk-core/validate-json-rpc-message.md',
      destination: '/v6/docs/reference/ai-sdk-core/create-mcp-client.md',
      permanent: false,
    },
    {
      source: '/v5/docs/reference/ai-sdk-core/validate-json-rpc-message',
      destination: '/v5/docs/reference/ai-sdk-core/create-mcp-client',
      permanent: false,
    },
    {
      source: '/v5/docs/reference/ai-sdk-core/validate-json-rpc-message.md',
      destination: '/v5/docs/reference/ai-sdk-core/create-mcp-client.md',
      permanent: false,
    },
  ],
};

export default withMDX(config);
