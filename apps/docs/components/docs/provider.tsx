'use client';

import { GeistdocsProvider } from '@vercel/geistdocs/layout';
import { useSelectedLayoutSegment } from 'next/navigation';
import type { ComponentProps } from 'react';

/** Mounted in [lang]/layout so the first segment identifies the docs version. */
export const DocsProvider = (
  props: Omit<ComponentProps<typeof GeistdocsProvider>, 'search'>,
) => {
  const segment = useSelectedLayoutSegment();
  const version = segment === 'v5' || segment === 'v6' ? segment : 'v7';

  return (
    <GeistdocsProvider
      {...props}
      // The tag becomes part of the search URL and the client's cache key.
      search={{ options: { tag: version } }}
    />
  );
};
