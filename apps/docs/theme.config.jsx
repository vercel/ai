import { useConfig } from 'nextra-theme-docs'

/** @type{import('nextra-theme-docs').DocsThemeConfig}*/
export default {
  project: {
    link: 'https://github.com/shuding/nextra'
  },
  logo: (
    <span className="inline-flex items-center">
      <svg
        height={22}
        viewBox="0 0 235 203"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Vercel Logo"
        className="fill-current h-6 w-6"
      >
        <path d="M117.082 0L234.164 202.794H0L117.082 0Z" fill="currentColor" />
      </svg>

      <svg
        fill="none"
        height="26"
        shapeRendering="geometricPrecision"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="text-zinc-100 dark:text-zinc-700 ml-1.5"
      >
        <path d="M16.88 3.549L7.12 20.451"></path>
      </svg>

      <span className="connect ml-1 lg:text-lg font-bold tracking-[-0.01em]">
        <svg
          width="14"
          height="17"
          viewBox="0 0 14 17"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="inline mr-1  h-5 w-5 mb-0.5"
        >
          <path
            d="M7.73047 16.2559C7.81836 16.2559 7.88916 16.2266 7.94287 16.168C8.00146 16.1143 8.03809 16.0435 8.05273 15.9556C8.15039 15.1841 8.25781 14.5347 8.375 14.0073C8.49707 13.48 8.6582 13.0479 8.8584 12.7109C9.05859 12.374 9.32471 12.1055 9.65674 11.9053C9.98877 11.7051 10.4136 11.5513 10.9312 11.4438C11.4536 11.3315 12.0933 11.2339 12.8501 11.1509C12.9429 11.1411 13.0161 11.1069 13.0698 11.0483C13.1284 10.9897 13.1577 10.9165 13.1577 10.8286C13.1577 10.7407 13.1284 10.6675 13.0698 10.6089C13.0161 10.5503 12.9429 10.5161 12.8501 10.5063C12.0933 10.4233 11.4536 10.3281 10.9312 10.2207C10.4136 10.1084 9.98877 9.95215 9.65674 9.75195C9.32471 9.55176 9.05859 9.2832 8.8584 8.94629C8.6582 8.60938 8.49707 8.17725 8.375 7.6499C8.25781 7.12256 8.15039 6.4707 8.05273 5.69434C8.03809 5.61133 8.00146 5.54297 7.94287 5.48926C7.88916 5.43066 7.81836 5.40137 7.73047 5.40137C7.64258 5.40137 7.56934 5.43066 7.51074 5.48926C7.45703 5.54297 7.42285 5.61133 7.4082 5.69434C7.31543 6.4707 7.20801 7.12256 7.08594 7.6499C6.96875 8.17725 6.80762 8.60938 6.60254 8.94629C6.40234 9.2832 6.13623 9.55176 5.8042 9.75195C5.47217 9.95215 5.04736 10.1084 4.52979 10.2207C4.01221 10.3281 3.37256 10.4233 2.61084 10.5063C2.51807 10.5161 2.44238 10.5503 2.38379 10.6089C2.3252 10.6675 2.2959 10.7407 2.2959 10.8286C2.2959 10.9165 2.3252 10.9897 2.38379 11.0483C2.44238 11.1069 2.51807 11.1411 2.61084 11.1509C3.36768 11.2485 4.00488 11.3584 4.52246 11.4805C5.04004 11.5977 5.4624 11.7539 5.78955 11.9492C6.12158 12.1445 6.3877 12.4082 6.58789 12.7402C6.78809 13.0674 6.94922 13.4922 7.07129 14.0146C7.19336 14.5371 7.30566 15.1841 7.4082 15.9556C7.42285 16.0435 7.45703 16.1143 7.51074 16.168C7.56934 16.2266 7.64258 16.2559 7.73047 16.2559ZM3.03564 8.57275C3.09424 8.57275 3.14307 8.55322 3.18213 8.51416C3.22119 8.4751 3.24316 8.42871 3.24805 8.375C3.31152 7.91113 3.375 7.55225 3.43848 7.29834C3.50195 7.03955 3.60205 6.84668 3.73877 6.71973C3.87549 6.58789 4.07812 6.48535 4.34668 6.41211C4.61523 6.33887 4.98877 6.25586 5.46729 6.16309C5.59424 6.14355 5.65771 6.07275 5.65771 5.95068C5.65771 5.89209 5.63818 5.8457 5.59912 5.81152C5.56494 5.77246 5.521 5.74805 5.46729 5.73828C4.98877 5.66992 4.61279 5.604 4.33936 5.54053C4.0708 5.47217 3.86816 5.37207 3.73145 5.24023C3.59961 5.10352 3.50195 4.90332 3.43848 4.63965C3.375 4.37109 3.31152 4.00244 3.24805 3.53369C3.2334 3.40186 3.1626 3.33594 3.03564 3.33594C2.90869 3.33594 2.83545 3.4043 2.81592 3.54102C2.76221 4 2.70361 4.35889 2.64014 4.61768C2.57666 4.87646 2.47656 5.07178 2.33984 5.20361C2.20312 5.33057 1.99805 5.43066 1.72461 5.50391C1.45605 5.57227 1.08252 5.65039 0.604004 5.73828C0.477051 5.7627 0.413574 5.8335 0.413574 5.95068C0.413574 6.07275 0.486816 6.14355 0.633301 6.16309C1.10205 6.24609 1.4707 6.32178 1.73926 6.39014C2.0127 6.4585 2.21533 6.55859 2.34717 6.69043C2.479 6.82227 2.57666 7.02002 2.64014 7.28369C2.70361 7.54248 2.76221 7.90381 2.81592 8.36768C2.83545 8.50439 2.90869 8.57275 3.03564 8.57275ZM6.40479 3.82666C6.48291 3.82666 6.53174 3.78271 6.55127 3.69482C6.61475 3.32861 6.67578 3.06006 6.73438 2.88916C6.79297 2.71338 6.90771 2.58887 7.07861 2.51562C7.24951 2.44238 7.5376 2.37158 7.94287 2.30322C8.03076 2.28369 8.07471 2.23486 8.07471 2.15674C8.07471 2.06885 8.03076 2.02002 7.94287 2.01025C7.5376 1.93701 7.24951 1.86621 7.07861 1.79785C6.90771 1.72461 6.79297 1.60254 6.73438 1.43164C6.67578 1.25586 6.61475 0.982422 6.55127 0.611328C6.53174 0.523438 6.48291 0.479492 6.40479 0.479492C6.31689 0.479492 6.26807 0.523438 6.2583 0.611328C6.18994 0.982422 6.12646 1.25586 6.06787 1.43164C6.01416 1.60254 5.89941 1.72461 5.72363 1.79785C5.55273 1.86621 5.26465 1.93701 4.85938 2.01025C4.77148 2.02002 4.72754 2.06885 4.72754 2.15674C4.72754 2.23486 4.77148 2.28369 4.85938 2.30322C5.26465 2.37158 5.55273 2.44238 5.72363 2.51562C5.89941 2.58887 6.01416 2.71338 6.06787 2.88916C6.12646 3.06006 6.18994 3.32861 6.2583 3.69482C6.26807 3.78271 6.31689 3.82666 6.40479 3.82666Z"
            fill="currentColor"
          />
        </svg>
        AI Connector
      </span>
      <style jsx>{`
        span.connect {
          mask-image: linear-gradient(
            60deg,
            black 25%,
            rgba(0, 0, 0, 0.2) 50%,
            black 75%
          );
          mask-size: 400%;
          mask-position: 0%;
        }
        span.connect:hover {
          mask-position: 100%;
          transition: mask-position 1s ease, -webkit-mask-position 1s ease;
        }
      `}</style>
    </span>
  ),
  useNextSeoProps: () => {
    const { title } = useConfig()
    return {
      defaultTitle: 'AI Connector',
      titleTemplate: '%s - AI Connector',
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
        <meta name="twitter:title" content="Vercel AI Connector" />
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
            className="fill-black dark:fill-white"
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
