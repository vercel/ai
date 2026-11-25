import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LogoIconVercelSvg } from '@vercel/geistdocs/assets/logos';
import { ImageResponse } from 'next/og';
import { renderToReadableStream } from 'react-dom/server.edge';
import satori, { type Font } from 'satori';

const regularFont = readFile(
  join(process.cwd(), 'lib/geistdocs/geist-sans-regular.ttf'),
);
const monoFont = readFile(
  join(process.cwd(), 'lib/geistdocs/geist-mono-regular.ttf'),
);

const contentWidth = 1072;
const logoBottom = 116;
const contentHeight = 630 - logoBottom - 56 * 2;

const renderText = async (
  title: string,
  subheading: string | undefined,
  fonts: Font[],
  scale = 1,
) => {
  let height = 0;
  const svg = await satori(
    <div
      id="og-text"
      style={{
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Geist',
        gap: 24 * scale,
        width: contentWidth,
      }}
    >
      <div
        style={{
          display: 'block',
          fontSize: 80 * scale,
          fontWeight: 400,
          letterSpacing: '-0.05em',
          lineHeight: 1.05,
          textWrap: subheading ? 'wrap' : 'balance',
          width: '100%',
          wordBreak: 'break-word',
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
            fontSize: 32 * scale,
            lineHeight: 1.25,
            textWrap: 'wrap',
            width: '100%',
            wordBreak: 'break-word',
          }}
        >
          {subheading}
        </div>
      ) : null}
    </div>,
    {
      width: contentWidth,
      fonts,
      onNodeDetected: node => {
        if (node.props.id === 'og-text') {
          height = node.height;
        }
      },
    },
  );
  return { svg, height };
};

export const createOpenGraphImage = async (
  title: string,
  subheading?: string,
) => {
  const fonts: Font[] = [
    { name: 'Geist', data: await regularFont, weight: 400 },
    { name: 'Geist Mono', data: await monoFont, weight: 400 },
  ];
  let text = await renderText(title, subheading, fonts);
  if (text.height > contentHeight) {
    // Reflowing at this smaller size can only reduce the number of lines.
    let min = contentHeight / text.height;
    let max = 1;
    text = await renderText(title, subheading, fonts, min);
    // Find the largest fitting size, to within roughly one title-font pixel.
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = (min + max) / 2;
      const candidate = await renderText(title, subheading, fonts, scale);
      if (candidate.height <= contentHeight) {
        text = candidate;
        min = scale;
      } else {
        max = scale;
      }
    }
  }

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
          bottom: 56,
          justifyContent: 'center',
          left: 64,
          position: 'absolute',
          top: logoBottom + 56,
          width: contentWidth,
        }}
      >
        {/* Rasterize the measured SVG so fitting and final wrapping agree. */}
        <img
          alt=""
          height={text.height}
          src={`data:image/svg+xml;base64,${Buffer.from(text.svg).toString('base64')}`}
          width={contentWidth}
        />
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
    },
  );
};
