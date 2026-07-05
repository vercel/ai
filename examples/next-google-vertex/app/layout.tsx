import type { Metadata } from 'next';
import { GeistSans, GeistMono } from 'geist/font';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI SDK - Google Vertex Examples',
  description:
    'Examples of using the AI SDK with Next.js and Google Vertex AI.',
  openGraph: {
    title: 'AI SDK - Google Vertex Examples',
    description:
      'Examples of using the AI SDK with Next.js and Google Vertex AI.',
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
    title: 'AI SDK - Google Vertex Examples',
    description:
      'Examples of using the AI SDK with Next.js and Google Vertex AI.',
    images: ['https://ai-sdk.dev/images/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
