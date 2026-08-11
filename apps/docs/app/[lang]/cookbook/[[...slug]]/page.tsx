import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { Upsell } from '@/components/docs/upsell';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { withOgDefaults } from '@/lib/og';
import { cookbookV7Source } from '@/lib/geistdocs/source';

const cookbookPage = createDocsPage({
  config,
  mdx: ({ link }) => getMdxComponents({ link, versionPrefix: '' }),
  metadata: ({ metadata, page }) =>
    withOgDefaults({
      ...metadata,
      alternates: {
        ...metadata.alternates,
        canonical: page.url,
      },
    }),
  openGraph: {
    images: true,
  },
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
  source: cookbookV7Source,
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
