import './globals.css';

export const metadata = {
  title: 'AI SDK Code Mode Comparison',
  description:
    'Compare direct AI SDK tools with ai-sdk-code-mode orchestration.',
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
