import './globals.css';
import { Sidebar } from '../components/sidebar';
import { MobileNav } from '../components/mobile-nav';

export const metadata = {
  title: 'AI SDK + LangChain Examples',
  description:
    'Example applications showcasing AI SDK with LangChain integration',
  openGraph: {
    title: 'AI SDK + LangChain Examples',
    description:
      'Example applications showcasing AI SDK with LangChain integration',
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
    title: 'AI SDK + LangChain Examples',
    description:
      'Example applications showcasing AI SDK with LangChain integration',
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
      <body
        className="flex flex-col lg:flex-row h-screen overflow-hidden"
        suppressHydrationWarning
      >
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--background)] relative">
          <MobileNav />
          <main className="flex-1 flex flex-col overflow-hidden border border-[var(--border-hover)] m-2 lg:m-3 rounded-xl bg-[var(--background-secondary)]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
