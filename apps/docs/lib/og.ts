import type { Metadata } from 'next';

/**
 * Site-level Open Graph fields. Next.js replaces (rather than merges) a
 * parent segment's `openGraph` whenever a page defines its own, so every
 * page-level `openGraph` object must carry these explicitly.
 */
export const ogDefaults = {
  siteName: 'AI SDK',
  type: 'website',
} as const;

/**
 * Social-card metadata for pages outside the docs page factories, using the
 * legacy production URL shape (/og/docs?title=…&description=…) served by
 * app/[lang]/og/[...slug]/route.tsx.
 */
export const socialCard = (
  title: string,
  description: string,
): Pick<Metadata, 'openGraph' | 'twitter'> => {
  const url = `/og/docs?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
  return {
    openGraph: { ...ogDefaults, title, description, images: [{ url }] },
    twitter: { card: 'summary_large_image', images: [{ url }] },
  };
};
