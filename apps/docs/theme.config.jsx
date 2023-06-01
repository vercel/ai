import { useConfig } from 'nextra-theme-docs'

/** @type{import('nextra-theme-docs').DocsThemeConfig}*/
export default {
  project: {
    link: 'https://github.com/shuding/nextra'
  },
  logo: (
    <div className="flex gap-2 items-center select-none">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        height="24"
        fill="none"
        viewBox="0 0 282 45"
      >
        <path
          className="fill-black dark:fill-white"
          d="M56.9 36h-7l9-27h8.7l9 27h-7l-6.2-20.1h-.2L56.9 36Zm-1-10.6h14.6v5H56v-5ZM85.2 9.1V36h-6.5V9h6.5Zm34.6 9.7h-6.6c0-.6-.3-1.2-.5-1.8a4.4 4.4 0 0 0-2.7-2.3 6 6 0 0 0-2-.3c-1.3 0-2.4.3-3.4 1-1 .6-1.7 1.5-2.2 2.8-.5 1.2-.7 2.6-.7 4.3 0 1.8.2 3.3.8 4.5a6 6 0 0 0 2.1 2.8c1 .6 2 .9 3.3.9.8 0 1.4-.1 2-.3l1.6-.8c.4-.4.8-.8 1-1.3.4-.5.6-1.1.7-1.8h6.6a11.2 11.2 0 0 1-7 9c-1.5.6-3.1.9-5 .9-2.4 0-4.6-.6-6.5-1.6-2-1.1-3.5-2.7-4.6-4.7-1-2.1-1.6-4.6-1.6-7.6s.5-5.4 1.6-7.5c1.2-2 2.7-3.6 4.6-4.7a14.4 14.4 0 0 1 11-1 11 11 0 0 1 3.7 2c1 1 1.9 2 2.5 3.2.7 1.3 1.1 2.7 1.3 4.3ZM132 36.4c-2.1 0-4-.5-5.5-1.3a9 9 0 0 1-3.5-3.7c-.8-1.5-1.2-3.4-1.2-5.4 0-2.1.4-4 1.2-5.5.8-1.5 2-2.8 3.5-3.6 1.5-1 3.4-1.3 5.5-1.3s4 .4 5.4 1.3c1.6.8 2.7 2 3.5 3.6.9 1.6 1.3 3.4 1.3 5.5 0 2-.4 3.9-1.3 5.4-.8 1.6-2 2.8-3.5 3.7-1.5.8-3.3 1.3-5.4 1.3Zm0-4.9c.8 0 1.4-.2 2-.7.5-.4 1-1.1 1.2-2a9 9 0 0 0 .4-2.9 9 9 0 0 0-.4-3c-.3-.7-.7-1.4-1.2-1.9-.6-.5-1.2-.7-2-.7a3 3 0 0 0-2 .7c-.5.5-1 1.2-1.2 2-.3.8-.5 1.8-.5 3 0 1 .2 2 .5 2.9.2.8.7 1.5 1.2 2a3 3 0 0 0 2 .6Zm19-7V36h-6.5V15.8h6.2v3.7h.2a5.7 5.7 0 0 1 2.3-2.9c1-.7 2.3-1 3.8-1a7 7 0 0 1 3.7 1c1 .5 1.9 1.4 2.5 2.6.5 1.1.8 2.4.8 4V36h-6.4V24.4c0-1.1-.3-2-.9-2.6a3 3 0 0 0-2.3-1c-.7 0-1.3.2-1.8.5a3 3 0 0 0-1.2 1.2c-.3.6-.4 1.2-.4 2Zm22.5 0V36h-6.4V15.8h6v3.7h.3a5.7 5.7 0 0 1 2.3-2.9c1-.7 2.4-1 3.8-1a7 7 0 0 1 3.7 1c1 .5 1.9 1.4 2.5 2.6.6 1.1.9 2.4.8 4V36h-6.4V24.4c0-1.1-.3-2-.8-2.6a3 3 0 0 0-2.4-1c-.7 0-1.3.2-1.8.5a3 3 0 0 0-1.2 1.2c-.3.6-.4 1.2-.4 2ZM199 36.4c-2 0-3.9-.4-5.4-1.3-1.6-.8-2.7-2-3.6-3.6-.8-1.5-1.2-3.4-1.2-5.5s.4-4 1.3-5.5a9 9 0 0 1 3.4-3.6c1.5-1 3.3-1.3 5.3-1.3 1.5 0 2.8.2 4 .6a8.5 8.5 0 0 1 5 5.3c.6 1.2.8 2.7.8 4.4v1.6h-17.5v-3.8h11.5c0-.7-.1-1.3-.5-1.8-.3-.5-.7-1-1.3-1.2-.5-.4-1.1-.5-1.8-.5a3.8 3.8 0 0 0-3.3 1.8c-.4.5-.5 1.1-.5 1.8v3.8c0 .9.1 1.6.4 2.2.4.6.8 1 1.4 1.4.6.4 1.3.5 2.2.5.5 0 1 0 1.5-.2s.9-.4 1.2-.7c.3-.3.6-.7.7-1.1l6 .2a7.3 7.3 0 0 1-1.7 3.4c-.8 1-1.9 1.7-3.2 2.3-1.4.5-3 .8-4.7.8Zm21.4 0c-2.1 0-4-.5-5.5-1.3-1.5-1-2.7-2.1-3.5-3.7-.8-1.6-1.2-3.4-1.2-5.4 0-2 .4-4 1.2-5.5A9 9 0 0 1 215 17c1.5-1 3.4-1.3 5.5-1.3 1.8 0 3.5.3 4.8 1 1.4.6 2.5 1.6 3.3 2.8a8.2 8.2 0 0 1 1.3 4.4h-6a4 4 0 0 0-1.1-2.5 3 3 0 0 0-2.2-.9c-.8 0-1.4.3-2 .7-.6.4-1 1-1.3 1.8-.3.8-.5 1.8-.5 3s.2 2.2.5 3a4 4 0 0 0 1.3 1.9c.6.4 1.2.6 2 .6.6 0 1-.1 1.5-.4a3 3 0 0 0 1.2-1.1c.3-.5.5-1.1.6-1.8h6c-.1 1.7-.5 3.1-1.3 4.4a7.7 7.7 0 0 1-3.2 2.9c-1.4.6-3 1-5 1Zm23.1-20.6v4.7h-12.7v-4.7h12.7Zm-10-4.8h6.4v18.7c0 .3 0 .7.2 1l.5.4.9.2a4.9 4.9 0 0 0 1.4-.2l1 4.6a29.7 29.7 0 0 1-3.3.6c-1.5 0-2.8-.1-3.9-.5a5 5 0 0 1-2.4-2c-.6-1-.9-2-.9-3.4V11ZM255 36.4c-2.2 0-4-.5-5.5-1.3a9 9 0 0 1-3.5-3.7c-.8-1.5-1.2-3.4-1.2-5.4 0-2.1.4-4 1.2-5.5.8-1.5 2-2.8 3.5-3.6 1.5-1 3.3-1.3 5.5-1.3 2 0 4 .4 5.4 1.3 1.5.8 2.7 2 3.5 3.6.9 1.6 1.3 3.4 1.3 5.5 0 2-.4 3.9-1.3 5.4-.8 1.6-2 2.8-3.5 3.7-1.5.8-3.3 1.3-5.4 1.3Zm0-4.9c.8 0 1.4-.2 2-.7.5-.4 1-1.1 1.2-2a9 9 0 0 0 .4-2.9 9 9 0 0 0-.4-3c-.3-.7-.7-1.4-1.2-1.9-.6-.5-1.2-.7-2-.7a3 3 0 0 0-2 .7c-.6.5-1 1.2-1.3 2-.2.8-.4 1.8-.4 3 0 1 .2 2 .4 2.9.3.8.7 1.5 1.3 2a3 3 0 0 0 2 .6Zm12.5 4.5V15.8h6.3v3.7h.2c.3-1.3 1-2.3 1.8-3 .8-.6 1.8-1 2.9-1a5.8 5.8 0 0 1 2.8.8l-1.9 5.3-.9-.4-1-.1a3.6 3.6 0 0 0-3.2 1.9c-.4.5-.5 1.2-.5 2v11h-6.5ZM19 6l19 32H0L19 6Z"
        />
      </svg>
      <style jsx>{`
        div {
          mask-image: linear-gradient(
            60deg,
            black 25%,
            rgba(0, 0, 0, 0.2) 50%,
            black 75%
          );
          mask-size: 400%;
          mask-position: 0%;
        }
        div:hover {
          mask-position: 100%;
          transition: mask-position 1s ease, -webkit-mask-position 1s ease;
        }
      `}</style>
    </div>
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
