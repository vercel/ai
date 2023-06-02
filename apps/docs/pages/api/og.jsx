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
          color: '#eee',
          backgroundColor: 'black',
          backgroundImage:
            'radial-gradient(circle at 25px 25px, #333 2%, transparent 0%), radial-gradient(circle at 75px 75px, #333 2%, transparent 0%)',
          backgroundSize: '100px 100px'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -80
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height={300}
            fill="none"
            viewBox="0 0 1024 1024"
          >
            <g clipPath="url(#clip0_102_149)">
              <g filter="url(#filter0_f_102_149)">
                <path
                  fill="url(#paint0_linear_102_149)"
                  d="M271.397 387.492L382.448 251l176.963 74.233c15.046 75.03 22.05 225.092-70.306 225.092-77.786 0-96.235-44.353-95.824-77.026-9.458 60.37-48.91 151.792-151.045 136.093-17.257-12.133 12.25-152.988 29.161-221.9z"
                ></path>
                <path
                  fill="url(#paint1_linear_102_149)"
                  d="M512.894 440.471l135.904 109.714 133.343 9.933c-32.196 69.432-115.224 194.677-189.764 140.198-74.54-54.48-112.055 100.239-87.777 79.248-37.795 44.407-66.034-97.118-146.376-177.201-6.758-19.971 100.298-116.249 154.67-161.892z"
                ></path>
                <path
                  fill="url(#paint2_linear_102_149)"
                  d="M702.226 604.788l-167.361-50.143-127.183 41.242c3.491-76.442 32.88-223.77 122.515-201.539 89.636 22.231 65.731-135.162 51.214-106.55 18.154-55.398 97.919 64.913 202.627 108.646 13.823 15.929-48.782 145.533-81.812 208.344z"
                ></path>
              </g>
              <g filter="url(#filter1_dd_102_149)">
                <rect
                  width="504"
                  height="504"
                  x="260"
                  y="260"
                  fill="url(#paint3_linear_102_149)"
                  rx="41"
                ></rect>
                <rect
                  width="490"
                  height="490"
                  x="267"
                  y="267"
                  stroke="url(#paint4_linear_102_149)"
                  strokeOpacity="0.52"
                  strokeWidth="4"
                  rx="34"
                ></rect>
              </g>
              <g filter="url(#filter2_di_102_149)">
                <path
                  fill="url(#paint5_linear_102_149)"
                  d="M511.5 392L636 607H387l124.5-215z"
                ></path>
              </g>
            </g>
            <defs>
              <filter
                id="filter0_f_102_149"
                width="1149"
                height="1137"
                x="-63"
                y="-49"
                colorInterpolationFilters="sRGB"
                filterUnits="userSpaceOnUse"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
                <feBlend
                  in="SourceGraphic"
                  in2="BackgroundImageFix"
                  result="shape"
                ></feBlend>
                <feGaussianBlur
                  result="effect1_foregroundBlur_102_149"
                  stdDeviation="150"
                ></feGaussianBlur>
              </filter>
              <filter
                id="filter1_dd_102_149"
                width="580"
                height="580"
                x="222"
                y="238"
                colorInterpolationFilters="sRGB"
                filterUnits="userSpaceOnUse"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
                <feColorMatrix
                  in="SourceAlpha"
                  result="hardAlpha"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                ></feColorMatrix>
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="5"
                  result="effect1_dropShadow_102_149"
                ></feMorphology>
                <feOffset dy="16"></feOffset>
                <feGaussianBlur stdDeviation="16.5"></feGaussianBlur>
                <feComposite in2="hardAlpha" operator="out"></feComposite>
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.18 0"></feColorMatrix>
                <feBlend
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_102_149"
                ></feBlend>
                <feColorMatrix
                  in="SourceAlpha"
                  result="hardAlpha"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                ></feColorMatrix>
                <feOffset dy="4"></feOffset>
                <feGaussianBlur stdDeviation="4.5"></feGaussianBlur>
                <feComposite in2="hardAlpha" operator="out"></feComposite>
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.23 0"></feColorMatrix>
                <feBlend
                  in2="effect1_dropShadow_102_149"
                  result="effect2_dropShadow_102_149"
                ></feBlend>
                <feBlend
                  in="SourceGraphic"
                  in2="effect2_dropShadow_102_149"
                  result="shape"
                ></feBlend>
              </filter>
              <filter
                id="filter2_di_102_149"
                width="331"
                height="297"
                x="346"
                y="359"
                colorInterpolationFilters="sRGB"
                filterUnits="userSpaceOnUse"
              >
                <feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
                <feColorMatrix
                  in="SourceAlpha"
                  result="hardAlpha"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                ></feColorMatrix>
                <feOffset dy="8"></feOffset>
                <feGaussianBlur stdDeviation="20.5"></feGaussianBlur>
                <feComposite in2="hardAlpha" operator="out"></feComposite>
                <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"></feColorMatrix>
                <feBlend
                  in2="BackgroundImageFix"
                  result="effect1_dropShadow_102_149"
                ></feBlend>
                <feBlend
                  in="SourceGraphic"
                  in2="effect1_dropShadow_102_149"
                  result="shape"
                ></feBlend>
                <feColorMatrix
                  in="SourceAlpha"
                  result="hardAlpha"
                  values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                ></feColorMatrix>
                <feOffset dx="0.5" dy="7"></feOffset>
                <feGaussianBlur stdDeviation="0.5"></feGaussianBlur>
                <feComposite
                  in2="hardAlpha"
                  k2="-1"
                  k3="1"
                  operator="arithmetic"
                ></feComposite>
                <feColorMatrix values="0 0 0 0 0.0286285 0 0 0 0 0.0404458 0 0 0 0 0.0708333 0 0 0 0.06 0"></feColorMatrix>
                <feBlend
                  in2="shape"
                  result="effect2_innerShadow_102_149"
                ></feBlend>
              </filter>
              <linearGradient
                id="paint0_linear_102_149"
                x1="511.5"
                x2="511.5"
                y1="251"
                y2="788"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#F90"></stop>
                <stop offset="1" stopColor="#F09"></stop>
              </linearGradient>
              <linearGradient
                id="paint1_linear_102_149"
                x1="511.5"
                x2="511.5"
                y1="139.997"
                y2="678.584"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#00D1FF"></stop>
                <stop offset="1" stopColor="#0057FF"></stop>
              </linearGradient>
              <linearGradient
                id="paint2_linear_102_149"
                x1="475.081"
                x2="747.802"
                y1="537.554"
                y2="389.678"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#AD00FF"></stop>
                <stop offset="1" stopColor="red"></stop>
              </linearGradient>
              <linearGradient
                id="paint3_linear_102_149"
                x1="512"
                x2="512"
                y1="260"
                y2="764"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#333434"></stop>
                <stop offset="1" stopColor="#060606"></stop>
              </linearGradient>
              <linearGradient
                id="paint4_linear_102_149"
                x1="512"
                x2="512"
                y1="260"
                y2="764"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#727272"></stop>
                <stop offset="1" stopColor="#2C2D2E"></stop>
              </linearGradient>
              <linearGradient
                id="paint5_linear_102_149"
                x1="356.886"
                x2="653.118"
                y1="526.038"
                y2="618.121"
                gradientUnits="userSpaceOnUse"
              >
                <stop stopColor="#fff"></stop>
                <stop offset="0.089" stopColor="#FEFEFE"></stop>
                <stop offset="0.161" stopColor="#FCFCFC"></stop>
                <stop offset="0.22" stopColor="#F9F9F9"></stop>
                <stop offset="0.267" stopColor="#F5F5F5"></stop>
                <stop offset="0.305" stopColor="#F0F0F0"></stop>
                <stop offset="0.336" stopColor="#EAEAEA"></stop>
                <stop offset="0.364" stopColor="#E3E3E3"></stop>
                <stop offset="0.391" stopColor="#DCDCDC"></stop>
                <stop offset="0.418" stopColor="#D5D5D5"></stop>
                <stop offset="0.45" stopColor="#CDCDCD"></stop>
                <stop offset="0.488" stopColor="#C6C6C6"></stop>
                <stop offset="0.535" stopColor="#BEBEBE"></stop>
                <stop offset="0.593" stopColor="#B7B7B7"></stop>
                <stop offset="0.666" stopColor="#B0B0B0"></stop>
                <stop offset="0.755" stopColor="#AAA"></stop>
              </linearGradient>
              <clipPath id="clip0_102_149">
                <path fill="#fff" d="M0 0H1024V1024H0z"></path>
              </clipPath>
            </defs>
          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 70,
            fontStyle: 'normal',
            marginTop: -20,
            maxWidth: 800,
            lineHeight: 1.2,
            whiteSpace: 'pre-wrap',
            letterSpacing: '-0.03em'
          }}
        >
          <b>{title || 'Vercel AI SDK'}</b>
        </div>
        {title ? (
          <div
            style={{
              display: 'flex',
              fontSize: 36,
              marginTop: 20
            }}
          >
            <b>Vercel AI SDK</b>
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
