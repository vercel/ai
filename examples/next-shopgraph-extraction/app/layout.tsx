import './globals.css';

export const metadata = {
  title: 'Product Extraction with Confidence Scoring',
  description:
    'Extract product data from any URL with per-field confidence scores.',
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
