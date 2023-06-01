import { useConfig } from 'nextra-theme-docs'

/** @type{import('nextra-theme-docs').DocsThemeConfig}*/
export default {
  project: {
    link: 'https://github.com/shuding/nextra'
  },
  logo: (
    <span className="flex gap-2 font-bold text-lg items-center select-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        height="24"
        fill="none"
        viewBox="0 0 1024 1024"
      >
        <g clipPath="url(#clip0_102_208)">
          <rect
            width="977.455"
            height="977.455"
            x="23.273"
            y="23.273"
            fill="url(#paint0_linear_102_208)"
            rx="79.515"
          ></rect>
          <g filter="url(#filter0_di_102_208)">
            <path
              fill="url(#paint1_linear_102_208)"
              d="M511.03 306.424l210.424 362.667H300.606L511.03 306.424z"
            ></path>
          </g>
          <mask
            id="mask0_102_208"
            style={{ maskType: 'alpha' }}
            width="1024"
            height="1024"
            x="0"
            y="0"
            maskUnits="userSpaceOnUse"
          >
            <rect
              width="1000.73"
              height="1000.73"
              x="11.636"
              y="11.636"
              stroke="#000"
              strokeWidth="23.273"
              rx="91.151"
            ></rect>
          </mask>
          <g filter="url(#filter1_f_102_208)" mask="url(#mask0_102_208)">
            <path
              fill="url(#paint2_linear_102_208)"
              d="M-88.638 197.111l277.355-340.626L630.689 41.738c37.58 187.244 55.072 561.734-175.591 561.734-194.273 0-240.351-110.687-239.325-192.224-23.622 150.658-122.154 378.807-377.242 339.629-43.1-30.278 30.596-381.793 72.83-553.766z"
            ></path>
            <path
              fill="url(#paint3_linear_102_208)"
              d="M514.513 329.324l339.424 273.797 333.033 24.789c-80.41 173.273-287.78 485.83-473.947 349.874-186.167-135.958-279.862 250.156-219.226 197.766-94.394 110.83-164.922-242.362-365.58-442.213-16.878-49.841 250.498-290.109 386.296-404.013z"
            ></path>
            <path
              fill="url(#paint4_linear_102_208)"
              d="M987.377 739.387L569.385 614.252 251.741 717.175c8.717-190.768 82.117-558.433 305.986-502.955 223.869 55.478 164.166-337.305 127.908-265.904 45.342-138.248 244.558 161.995 506.075 271.134 34.52 39.752-121.84 363.188-204.333 519.937z"
            ></path>
          </g>
        </g>
        <defs>
          <filter
            id="filter0_di_102_208"
            width="579.879"
            height="521.697"
            x="221.091"
            y="242.424"
            colorInterpolationFilters="sRGB"
            filterUnits="userSpaceOnUse"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix"></feFlood>
            <feColorMatrix
              in="SourceAlpha"
              result="hardAlpha"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            ></feColorMatrix>
            <feOffset dy="15.515"></feOffset>
            <feGaussianBlur stdDeviation="39.758"></feGaussianBlur>
            <feComposite in2="hardAlpha" operator="out"></feComposite>
            <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"></feColorMatrix>
            <feBlend
              in2="BackgroundImageFix"
              result="effect1_dropShadow_102_208"
            ></feBlend>
            <feBlend
              in="SourceGraphic"
              in2="effect1_dropShadow_102_208"
              result="shape"
            ></feBlend>
            <feColorMatrix
              in="SourceAlpha"
              result="hardAlpha"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            ></feColorMatrix>
            <feOffset dx="0.97" dy="13.576"></feOffset>
            <feGaussianBlur stdDeviation="0.97"></feGaussianBlur>
            <feComposite
              in2="hardAlpha"
              k2="-1"
              k3="1"
              operator="arithmetic"
            ></feComposite>
            <feColorMatrix values="0 0 0 0 0.0286285 0 0 0 0 0.0404458 0 0 0 0 0.0708333 0 0 0 0.06 0"></feColorMatrix>
            <feBlend in2="shape" result="effect2_innerShadow_102_208"></feBlend>
          </filter>
          <filter
            id="filter1_f_102_208"
            width="2146.91"
            height="2115.88"
            x="-562.424"
            y="-531.394"
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
              result="effect1_foregroundBlur_102_208"
              stdDeviation="193.939"
            ></feGaussianBlur>
          </filter>
          <linearGradient
            id="paint0_linear_102_208"
            x1="512"
            x2="512"
            y1="23.273"
            y2="1000.73"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#333434"></stop>
            <stop offset="1" stopColor="#060606"></stop>
          </linearGradient>
          <linearGradient
            id="paint1_linear_102_208"
            x1="249.709"
            x2="750.212"
            y1="532.522"
            y2="688.409"
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
          <linearGradient
            id="paint2_linear_102_208"
            x1="511.03"
            x2="511.03"
            y1="-143.515"
            y2="1196.61"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F90"></stop>
            <stop offset="1" stopColor="#F09"></stop>
          </linearGradient>
          <linearGradient
            id="paint3_linear_102_208"
            x1="511.03"
            x2="511.03"
            y1="-420.532"
            y2="923.552"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#00D1FF"></stop>
            <stop offset="1" stopColor="#0057FF"></stop>
          </linearGradient>
          <linearGradient
            id="paint4_linear_102_208"
            x1="420.072"
            x2="1100.96"
            y1="571.6"
            y2="202.116"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#AD00FF"></stop>
            <stop offset="1" stopColor="red"></stop>
          </linearGradient>
          <clipPath id="clip0_102_208">
            <path fill="#fff" d="M0 0H1024V1024H0z"></path>
          </clipPath>
        </defs>
      </svg>
      AI Utils
    </span>
  ),
  useNextSeoProps: () => {
    const { title } = useConfig()
    return {
      defaultTitle: 'AI Utils',
      titleTemplate: '%s - AI Utils',
      title,
      description:
        'Edge-ready utilities to accelerate working with AI in JavaScript and React.'
    }
  },
  head: () => {
    const { title } = useConfig()
    return (
      <>
        <meta
          name="og:image"
          content={
            'https://ai-utils-docs.vercel.sh/api/og?' +
            new URLSearchParams({ title }).toString()
          }
        />
        <meta
          name="twitter:image"
          content={
            'https://ai-utils-docs.vercel.sh/api/og?' +
            new URLSearchParams({ title }).toString()
          }
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@vercel" />
        <meta name="twitter:creator" content="@vercel" />
        <meta name="twitter:title" content="Vercel AI Utils" />
        <meta
          name="twitter:description"
          content="Edge-ready utilities to accelerate working with AI in JavaScript and React."
        />
        <link
          rel="apple-touch-icon"
          sizes="57x57"
          href="/apple-icon-57x57.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="60x60"
          href="/apple-icon-60x60.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="72x72"
          href="/apple-icon-72x72.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/apple-icon-76x76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="114x114"
          href="/apple-icon-114x114.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/apple-icon-120x120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href="/apple-icon-144x144.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/apple-icon-152x152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-icon-180x180.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/android-icon-192x192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="96x96"
          href="/favicon-96x96.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="msapplication-TileColor" content="#ffffff" />
        <meta name="msapplication-TileImage" content="/ms-icon-144x144.png" />
        <meta name="theme-color" content="#ffffff" />
      </>
    )
  },
  docsRepositoryBase:
    'https://github.com/vercel-labs/ai-utils/tree/main/apps/docs',
  project: {
    link: 'https://github.com/vercel-labs/ai-utils'
  },
  footer: {
    text: (
      <div className="flex flex-col justify-center items-center md:items-start gap-4 text-sm text-center">
        <a href="https://vercel.com/" target="_blank">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="#000000"
            height={20}
            style={{ opacity: 0.8 }}
            viewBox="0 0 284 65"
          >
            <path d="M141.68 16.25c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.46 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zm117.14-14.5c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.45 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zm-39.03 3.5c0 6 3.92 10 10 10 4.12 0 7.21-1.87 8.8-4.92l7.68 4.43c-3.18 5.3-9.14 8.49-16.48 8.49-11.05 0-19-7.2-19-18s7.96-18 19-18c7.34 0 13.29 3.19 16.48 8.49l-7.68 4.43c-1.59-3.05-4.68-4.92-8.8-4.92-6.07 0-10 4-10 10zm82.48-29v46h-9v-46h9zM37.59.25l36.95 64H.64l36.95-64zm92.38 5l-27.71 48-27.71-48h10.39l17.32 30 17.32-30h10.39zm58.91 12v9.69c-1-.29-2.06-.49-3.2-.49-5.81 0-10 4-10 10v14.8h-9v-34h9v9.2c0-5.08 5.91-9.2 13.2-9.2z" />
          </svg>
        </a>
        <span>© 2023 Vercel Inc.</span>
      </div>
    )
  }
}
