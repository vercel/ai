import { siteUrlIssue } from './site-url';

if (siteUrlIssue && process.env.NODE_ENV === 'production') {
  process.emitWarning(
    `${siteUrlIssue}. Absolute site URLs will use http://localhost:3000.`,
    {
      code: 'GEISTDOCS_SITE_URL_FALLBACK',
    },
  );
}
