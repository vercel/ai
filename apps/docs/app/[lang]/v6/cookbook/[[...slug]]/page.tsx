import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { Upsell } from '@/components/docs/upsell';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { cookbookV6Source } from '@/lib/geistdocs/source';

const cookbookPage = createDocsPage({
  config,
  mdx: ({ link }) => getMdxComponents({ link, versionPrefix: '/v6' }),
  metadata: ({ metadata, page }) => ({
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: page.url,
    },
    robots: {
      index: false,
      follow: true,
    },
  }),
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
  source: cookbookV6Source,
  tableOfContent: {
    footer: <Upsell />,
  },
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = cookbookPage.generateMetadata;
export const generateStaticParams = cookbookPage.generateStaticParams;
export default cookbookPage.Page;
