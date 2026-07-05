import './globals.css';
import Toaster from './toaster';
import { KasadaClient } from '@/kasada/kasada-client';

export const metadata = {
  title: 'AI SDK - Next.js OpenAI Examples',
  description: 'Examples of using the AI SDK with Next.js and OpenAI.',
  openGraph: {
    title: 'AI SDK - Next.js OpenAI Examples',
    description: 'Examples of using the AI SDK with Next.js and OpenAI.',
    images: [
      {
        url: 'https://ai-sdk.dev/images/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI SDK - Next.js OpenAI Examples',
    description: 'Examples of using the AI SDK with Next.js and OpenAI.',
    images: ['https://ai-sdk.dev/images/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <Toaster />
      <KasadaClient />
      <body>{children}</body>
    </html>
  );
}
