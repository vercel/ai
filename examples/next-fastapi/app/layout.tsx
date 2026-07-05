import './globals.css';
import { LogoNext, LogoPython } from './icons';
import Link from 'next/link';
import { GeistSans } from 'geist/font/sans';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI SDK and FastAPI Examples',
  description: 'Examples of using the AI SDK with Next.js and FastAPI.',
  openGraph: {
    title: 'AI SDK and FastAPI Examples',
    description: 'Examples of using the AI SDK with Next.js and FastAPI.',
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
    title: 'AI SDK and FastAPI Examples',
    description: 'Examples of using the AI SDK with Next.js and FastAPI.',
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
      <body className={GeistSans.className}>
        <Link href="/">
          <div className="border-b p-4 flex flex-row gap-2">
            <LogoNext />
            <div className="text-sm text-zinc-500">+</div>
            <LogoPython />
          </div>
        </Link>
        {children}
      </body>
    </html>
  );
}
