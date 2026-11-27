import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: {
    template: '%s | Durable Harness Examples',
    default: 'Durable Harness Examples',
  },
  description:
    'Examples using the AI SDK harness abstraction with durable harness execution.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
