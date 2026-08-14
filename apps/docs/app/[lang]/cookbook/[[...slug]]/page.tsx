import { MobileDocsBar } from '@vercel/geistdocs/mobile-docs-bar';
import { createDocsPage } from '@vercel/geistdocs/pages/docs';
import { getMdxComponents } from '@/components/mdx-components';
import { config } from '@/lib/geistdocs/config';
import { cookbookV7Source } from '@/lib/geistdocs/source';

const cookbookPage = createDocsPage({
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
  source: cookbookV7Source,
  tableOfContentPopover: {
    enabled: false,
  },
});

export const generateMetadata = cookbookPage.generateMetadata;
export const generateStaticParams = cookbookPage.generateStaticParams;
export default cookbookPage.Page;
