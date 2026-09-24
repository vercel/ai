const versionedFamilies = ['/docs', '/providers', '/cookbook'];

export type ResolveHref = (href: string) => string;

// Route families that only exist on the production site so far.
// /resources, /showcase, /examples, /elements, and /tools-registry resolve
// in-app (directly or through next.config.ts redirects).
const externalFamilies = ['/playground', '/getting-started'];

export const resolveDocsHref = (href: string, versionPrefix: string) => {
  if (versionedFamilies.some(family => href.startsWith(family))) {
    return `${versionPrefix}${href}`;
  }
  if (externalFamilies.some(family => href.startsWith(family))) {
    return `https://ai-sdk.dev${href}`;
  }
  return href;
};
