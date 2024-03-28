import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AI } from './action';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Basic AI RSC Demo',
  description:
    'Demo of a flight assistant built using Next.js and Vercel AI SDK.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AI>{children}</AI>
      </body>
    </html>
  );
}
