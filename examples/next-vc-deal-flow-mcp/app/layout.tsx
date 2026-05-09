import './globals.css';

export const metadata = {
  title: 'AI SDK + MCP — VC Deal Flow Research',
  description:
    'Streaming chat agent that calls a public MCP server to research engineering momentum at venture-backed startups.',
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
