import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LogoIconVercelSvg } from '@vercel/geistdocs/assets/logos';
import { ImageResponse } from 'next/og';
import { renderToReadableStream } from 'react-dom/server.edge';

const regularFont = readFile(
  join(process.cwd(), 'lib/geistdocs/geist-sans-regular.ttf'),
);
const monoFont = readFile(
  join(process.cwd(), 'lib/geistdocs/geist-mono-regular.ttf'),
);

export const createOpenGraphImage = async (
  title: string,
  subheading?: string,
) => {
  // Satori cannot resolve the memoized base component used by Geist icons.
  const logo = await new Response(
    await renderToReadableStream(<LogoIconVercelSvg size={60} />),
  ).text();

  return new ImageResponse(
    <div
      style={{
        backgroundColor: '#000',
        color: '#fff',
        display: 'flex',
        fontFamily: 'Geist',
        height: '100%',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', left: 64, position: 'absolute', top: 56 }}>
        {/* Satori requires a plain img element. */}
        <img
          alt="Vercel"
          height={60}
          src={`data:image/svg+xml;base64,${Buffer.from(logo.replaceAll('currentColor', '#fff')).toString('base64')}`}
          width={60}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          left: 64,
          position: 'absolute',
          top: 180,
          width: 1072,
        }}
      >
        <div
          style={{
            display: 'block',
            fontSize: title.length > 50 ? 64 : 80,
            fontWeight: 400,
            letterSpacing: '-0.05em',
            lineHeight: 0.95,
            textWrap: subheading ? 'wrap' : 'balance',
            width: '100%',
          }}
        >
          {title}
        </div>
        {subheading ? (
          <div
            style={{
              color: '#a1a1a1',
              display: 'block',
              fontFamily: 'Geist Mono',
              fontSize: 32,
              lineHeight: 1.25,
              textWrap: 'wrap',
              width: '100%',
            }}
          >
            {subheading}
          </div>
        ) : null}
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Geist', data: await regularFont, weight: 400 },
        { name: 'Geist Mono', data: await monoFont, weight: 400 },
      ],
    },
  );
};
