import type { Metadata } from 'next';
import { LandingPage } from '@/components/home/landing-page';
import { absoluteUrl } from '@/lib/geistdocs/site-url';

const description =
  'A unified TypeScript SDK for building AI apps with modern streaming, fallbacks, and multi-model support—powered by Vercel.';
const image = 'https://e742qlubrjnjqpp0.public.blob.vercel-storage.com/og.png';

export const metadata: Metadata = {
  title: { absolute: 'AI SDK' },
  description,
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    title: 'AI SDK',
    description,
    url: absoluteUrl('/'),
    siteName: 'AI SDK',
    type: 'website',
    images: [{ url: image }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI SDK',
    description,
    images: [image],
  },
};

export default LandingPage;
