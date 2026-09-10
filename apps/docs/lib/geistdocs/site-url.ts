const configuredUrl = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
const fallbackSiteUrl = new URL('http://localhost:3000');

const resolveSiteUrl = () => {
  if (!configuredUrl) {
    return {
      issue: 'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL is not set',
      url: fallbackSiteUrl,
    };
  }

  const value =
    configuredUrl.startsWith('http://') || configuredUrl.startsWith('https://')
      ? configuredUrl
      : `https://${configuredUrl}`;

  try {
    return { issue: undefined, url: new URL(value) };
  } catch {
    return {
      issue: 'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL is invalid',
      url: fallbackSiteUrl,
    };
  }
};

const resolvedSiteUrl = resolveSiteUrl();

export const isSiteUrlConfigured = !resolvedSiteUrl.issue;
export const siteUrlIssue = resolvedSiteUrl.issue;
export const siteUrl = resolvedSiteUrl.url;

export const absoluteUrl = (path: string) => new URL(path, siteUrl).toString();
