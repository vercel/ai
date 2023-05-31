import { ImageResponse } from 'next/server'

export const runtime = 'edge'

const font = fetch(new URL('./Inter-ExtraBold.ttf', import.meta.url)).then(
  res => res.arrayBuffer()
)

export default async function handler(request) {
  const { searchParams } = request.nextUrl
  const title = searchParams.get('title')

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          textAlign: 'center',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          flexWrap: 'nowrap',
          fontFamily: 'inter',
          backgroundColor: 'white',
          backgroundImage:
            'radial-gradient(circle at 25px 25px, lightgray 2%, transparent 0%), radial-gradient(circle at 75px 75px, lightgray 2%, transparent 0%)',
          backgroundSize: '100px 100px'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg
            height={140}
            viewBox="0 0 75 65"
            fill="black"
            style={{ margin: '0 75px' }}
          >
            <path d="M37.59.25l36.95 64H.64l36.95-64z"></path>
          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 60,
            fontStyle: 'normal',
            color: 'black',
            marginTop: 40,
            maxWidth: 800,
            lineHeight: 1.2,
            whiteSpace: 'pre-wrap',
            letterSpacing: '-0.02em'
          }}
        >
          <b>{title || 'Vercel AI Utils'}</b>
        </div>
        {title ? (
          <div
            style={{
              display: 'flex',
              fontSize: 36,
              marginTop: 20
            }}
          >
            <b>Vercel AI Utils</b>
          </div>
        ) : null}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'inter',
          data: await font,
          style: 'normal'
        }
      ]
    }
  )
}
