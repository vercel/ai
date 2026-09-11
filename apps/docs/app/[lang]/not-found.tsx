import Link from 'next/link';

const NotFound = () => (
  <main className="mx-auto grid min-h-[60vh] w-full max-w-2xl content-center gap-5 px-6 py-20">
    <p className="font-mono text-gray-900 text-sm">404</p>
    <h1 className="font-[450] text-4xl tracking-tight">Page not found</h1>
    <p className="text-gray-900 text-lg">
      The requested page does not exist. Browse the documentation or use a
      machine-readable index to find the closest current page.
    </p>
    <ul className="grid gap-2">
      <li>
        <Link className="underline" href="/docs">
          Browse the documentation
        </Link>
      </li>
      {/* Route handlers, not pages: full navigation is intentional. */}
      <li>
        {/* oxlint-disable-next-line no-html-link-for-pages */}
        <a className="underline" href="/sitemap.md">
          Open the semantic sitemap
        </a>
      </li>
      <li>
        {/* oxlint-disable-next-line no-html-link-for-pages */}
        <a className="underline" href="/llms.txt">
          Open the complete Markdown corpus
        </a>
      </li>
    </ul>
  </main>
);

export default NotFound;
