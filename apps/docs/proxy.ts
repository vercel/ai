import { createProxy } from '@vercel/geistdocs/proxy';
import { config as geistdocsConfig } from '@/lib/geistdocs/config';
import { trackMdRequest } from '@/lib/geistdocs/md-tracking';

const proxy = createProxy({
  config: geistdocsConfig,
  trackMarkdownRequest: trackMdRequest,
  markdownRoutes: [
    { from: '/docs/*path', to: '/[lang]/llms.mdx/*path' },
    { from: '/v6/docs/*path', to: '/[lang]/v6/llms.mdx/*path' },
    { from: '/v5/docs/*path', to: '/[lang]/v5/llms.mdx/*path' },
    { from: '/providers/*path', to: '/[lang]/providers-llms.mdx/*path' },
    {
      from: '/v6/providers/*path',
      to: '/[lang]/v6/providers-llms.mdx/*path',
    },
    {
      from: '/v5/providers/*path',
      to: '/[lang]/v5/providers-llms.mdx/*path',
    },
    { from: '/cookbook/*path', to: '/[lang]/cookbook-llms.mdx/*path' },
    {
      from: '/v6/cookbook/*path',
      to: '/[lang]/v6/cookbook-llms.mdx/*path',
    },
    {
      from: '/v5/cookbook/*path',
      to: '/[lang]/v5/cookbook-llms.mdx/*path',
    },
    // /resources/recipes mirrors /cookbook (production serves the same
    // markdown for both surfaces).
    {
      from: '/resources/recipes/*path',
      to: '/[lang]/cookbook-llms.mdx/*path',
    },
    {
      from: '/v6/resources/recipes/*path',
      to: '/[lang]/v6/cookbook-llms.mdx/*path',
    },
    {
      from: '/v5/resources/recipes/*path',
      to: '/[lang]/v5/cookbook-llms.mdx/*path',
    },
  ],
});

export const config = {
  matcher: [
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|icon.svg|images(?:/|$)|sitemap.xml|robots.txt).*)',
  ],
};

export default proxy;
