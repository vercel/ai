import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { Upsell } from '@/components/docs/upsell';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { withOgDefaults } from '@/lib/og';
import { v7Source } from '@/lib/geistdocs/source';

const docsPage = createDocsPage({
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
  source: v7Source,
  tableOfContent: {
    footer: <Upsell />,
  },
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = docsPage.generateMetadata;
export const generateStaticParams = docsPage.generateStaticParams;
export default docsPage.Page;
