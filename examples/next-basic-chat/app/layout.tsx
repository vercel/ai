import type { ReactNode } from "react";

export const metadata = {
  title: "AI SDK – Next.js Basic Chat",
  description: "Minimal chat example using Vercel AI SDK."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#0b1120",
          color: "#e2e8f0"
        }}
      >
        {children}
      </body>
    </html>
  );
}
