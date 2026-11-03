import { resolvePlaygroundHref } from '@/lib/playground-urls';

const versionedFamilies = ['/docs', '/providers', '/cookbook'];

export type ResolveHref = (href: string) => string;

export const resolveDocsHref = (href: string, versionPrefix: string) => {
  const playgroundHref = resolvePlaygroundHref(href);
  if (playgroundHref) return playgroundHref;

  if (versionedFamilies.some(family => href.startsWith(family))) {
    return `${versionPrefix}${href}`;
  }

  return href;
};
