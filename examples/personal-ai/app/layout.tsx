import './globals.css';

export const metadata = {
  title: 'Personal AI',
  description: 'A private, locally run AI assistant.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
