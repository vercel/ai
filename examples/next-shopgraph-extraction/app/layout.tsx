import './globals.css';

export const metadata = {
  title: 'ShopGraph Authenticated Extraction',
  description:
    'Authenticated product data extraction with per-field confidence scoring.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
