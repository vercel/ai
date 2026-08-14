import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { Upsell } from '@/components/docs/upsell';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { withOgDefaults } from '@/lib/og';
import { providersV7Source } from '@/lib/geistdocs/source';

const providersPage = createDocsPage({
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
  source: providersV7Source,
  tableOfContent: {
    footer: <Upsell />,
  },
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = providersPage.generateMetadata;
export const generateStaticParams = providersPage.generateStaticParams;
export default providersPage.Page;
