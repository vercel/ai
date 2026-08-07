import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { providersV7Source } from '@/lib/geistdocs/source';

const providersPage = createDocsPage({
  config,
  mdx: ({ link }) => getMdxComponents({ link, versionPrefix: '' }),
  metadata: ({ metadata, page }) => ({
    ...metadata,
    alternates: {
      ...metadata.alternates,
      canonical: page.url,
    },
  }),
  renderTop: ({ data }) => <MobileDocsBar toc={data.toc} />,
  source: providersV7Source,
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = providersPage.generateMetadata;
export const generateStaticParams = providersPage.generateStaticParams;
export default providersPage.Page;
