import './globals.css';

export const metadata = {
  title: 'AI SDK - WorkflowAgent Chat',
  description:
    'Example of using the AI SDK WorkflowAgent with Next.js and Workflow DevKit.',
  openGraph: {
    title: 'AI SDK - WorkflowAgent Chat',
    description:
      'Example of using the AI SDK WorkflowAgent with Next.js and Workflow DevKit.',
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
    title: 'AI SDK - WorkflowAgent Chat',
    description:
      'Example of using the AI SDK WorkflowAgent with Next.js and Workflow DevKit.',
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
      <body>{children}</body>
    </html>
  );
}
