import { GeistdocsDocsLayout } from '@vercel/geistdocs/layout';
import type { ReactNode } from 'react';
import { VersionSelect } from '@/components/docs/version-select';
import { config } from '@/lib/geistdocs/config';
import { providersV5Source } from '@/lib/geistdocs/source';
import { missingVersionPaths } from '@/lib/geistdocs/version-paths';

const ProvidersLayout = async ({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) => {
  const { lang } = await params;
  return (
    <GeistdocsDocsLayout
      config={config}
      containerProps={{
        className: 'mx-auto max-w-[1448px] bg-background-200',
      }}
      sidebarTop={
        config.versions ? (
          <div className="mb-4">
            <VersionSelect
              current="v5"
              missingPaths={missingVersionPaths}
              versions={config.versions.items}
            />
          </div>
        ) : null
      }
      tree={providersV5Source.source.pageTree[lang]}
    >
      {children}
    </GeistdocsDocsLayout>
  );
};

export default ProvidersLayout;
