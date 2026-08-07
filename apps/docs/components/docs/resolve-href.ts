const versionedFamilies = ['/docs', '/providers', '/cookbook'];

export type ResolveHref = (href: string) => string;

const externalFamilies = [
  '/resources',
  '/playground',
  '/elements',
  '/getting-started',
  '/showcase',
  '/examples',
];

export const resolveDocsHref = (href: string, versionPrefix: string) => {
  if (versionedFamilies.some(family => href.startsWith(family))) {
    return `${versionPrefix}${href}`;
  }
  if (externalFamilies.some(family => href.startsWith(family))) {
    return `https://ai-sdk.dev${href}`;
  }
  return href;
};
