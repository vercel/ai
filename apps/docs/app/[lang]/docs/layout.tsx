import { GeistdocsDocsLayout } from '@vercel/geistdocs/layout';
import { getRootLang } from '@/lib/geistdocs/root-params';
import type { ReactNode } from 'react';
import { VersionSelect } from '@/components/docs/version-select';
import { config } from '@/lib/geistdocs/config';
import { v7Source } from '@/lib/geistdocs/source';
import { missingVersionPaths } from '@/lib/geistdocs/version-paths';

const DocsLayout = async ({ children }: { children: ReactNode }) => {
  const lang = await getRootLang();
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
              current="v7"
              missingPaths={missingVersionPaths}
              versions={config.versions.items}
            />
          </div>
        ) : null
      }
      tree={v7Source.source.pageTree[lang]}
    >
      {children}
    </GeistdocsDocsLayout>
  );
};

export default DocsLayout;
