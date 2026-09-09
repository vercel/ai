import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { Upsell } from '@/components/docs/upsell';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { recipesV5Source } from '@/lib/geistdocs/source';

const recipesPage = createDocsPage({
  config,
  mdx: ({ link }) => getMdxComponents({ link, versionPrefix: '/v5' }),
  metadata: ({ metadata, page }) => ({
    ...metadata,
    alternates: {
      ...metadata.alternates,
      // The same recipe is served on both URL surfaces (mirroring
      // production); /cookbook is the canonical one.
      canonical: page.url.replace('/resources/recipes/', '/cookbook/'),
    },
    robots: {
      index: false,
      follow: true,
    },
  }),
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
  source: recipesV5Source,
  tableOfContent: {
    footer: <Upsell />,
  },
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = recipesPage.generateMetadata;
// The landing page owns the family root; this required catch-all only
// renders slugged pages.
export const generateStaticParams = async () =>
  (await recipesPage.generateStaticParams()).filter(
    params => (params.slug?.length ?? 0) > 0,
  );
export default recipesPage.Page;
