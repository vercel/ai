const versionedFamilies = ['/docs', '/providers'];

const externalFamilies = [
  '/cookbook',
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
