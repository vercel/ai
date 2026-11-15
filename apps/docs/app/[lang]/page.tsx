import type { Metadata } from 'next';
import { LandingPage } from '@/components/home/landing-page';
import { absoluteUrl } from '@/lib/geistdocs/site-url';
import { socialCard } from '@/lib/og';

const description =
  'A unified TypeScript SDK for building AI apps with modern streaming, fallbacks, and multi-model support—powered by Vercel.';
const card = socialCard('AI SDK', description);

export const metadata: Metadata = {
  title: { absolute: 'AI SDK' },
  description,
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    ...card.openGraph,
    url: absoluteUrl('/'),
  },
  twitter: {
    ...card.twitter,
    title: 'AI SDK',
    description,
  },
};

export default LandingPage;
