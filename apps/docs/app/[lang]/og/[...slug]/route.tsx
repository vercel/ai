import type { NextRequest } from 'next/server';
import { translations } from '@/geistdocs';
import { config } from '@/lib/geistdocs/config';
import { createOpenGraphImage } from '@/lib/geistdocs/og';
import {
  cookbookV7Source,
  providersV7Source,
  v7Source,
} from '@/lib/geistdocs/source';

// The current-version sources whose pages get generated social cards
// (maintenance versions are noindex and get none).
const bundles = [v7Source, providersV7Source, cookbookV7Source];

// Bounds per-render cost on the unauthenticated query-param shape; real
// page titles and descriptions sit well inside these.
const TITLE_MAX_LENGTH = 140;
const DESCRIPTION_MAX_LENGTH = 320;

const clamp = (value: string | null, maxLength: number) =>
  value === null ? null : value.slice(0, maxLength);

// The query-param card is a pure function of its URL (copy changes change
// the URL), so browsers may cache it forever.
const IMMUTABLE_CACHE_CONTROL =
  'public, immutable, no-transform, max-age=31536000';
// The slug card's URL stays stable when a page's title changes: let the
// CDN cache it (deploys purge that) but make browsers revalidate.
const REVALIDATED_CACHE_CONTROL =
  'public, max-age=0, must-revalidate, no-transform, s-maxage=31536000';

const renderCard = async (
  title: string | null,
  description: string | null,
  cacheControl: string,
) => {
  const response = await createOpenGraphImage(
    title ?? config.title,
    description ?? undefined,
  );
  response.headers.set('Cache-Control', cacheControl);
  return response;
};

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ lang: string; slug: string[] }> },
) => {
  const { lang, slug } = await params;

  // Bound the locale axis: unknown locales never render cards.
  if (!(lang in translations)) {
    return new Response('Not found', { status: 404 });
  }

  // Legacy production shape, also used by the landing pages:
  // /og/docs?title=…&description=…
  if (slug.length === 1 && slug[0] === 'docs') {
    const { searchParams } = new URL(request.url);
    return renderCard(
      clamp(searchParams.get('title'), TITLE_MAX_LENGTH),
      clamp(searchParams.get('description'), DESCRIPTION_MAX_LENGTH),
      IMMUTABLE_CACHE_CONTROL,
    );
  }

  // Geistdocs shape: /og/<page-slugs>/image.png (see getPageImage).
  if (slug.at(-1) !== 'image.png') {
    return new Response('Not found', { status: 404 });
  }
  const pageSlugs = slug.slice(0, -1);
  for (const bundle of bundles) {
    const page = bundle.source.getPage(pageSlugs, lang);
    if (page) {
      return renderCard(
        clamp(page.data.title ?? null, TITLE_MAX_LENGTH),
        clamp(page.data.description ?? null, DESCRIPTION_MAX_LENGTH),
        REVALIDATED_CACHE_CONTROL,
      );
    }
  }
  return new Response('Not found', { status: 404 });
};
