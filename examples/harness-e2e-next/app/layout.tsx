import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Harness Workflow Examples',
  description:
    'Durable, multi-turn harness agents via the Vercel Workflow DevKit',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
