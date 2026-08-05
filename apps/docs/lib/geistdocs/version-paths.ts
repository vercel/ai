import { v5Sources, v6Sources, v7Sources } from './source';

const collect = (
  bundles: typeof v7Sources,
  stripPrefix: RegExp | null,
): Set<string> => {
  const paths = new Set<string>();
  for (const bundle of bundles) {
    for (const page of bundle.source.getPages('en')) {
      paths.add(stripPrefix ? page.url.replace(stripPrefix, '') : page.url);
    }
  }
  return paths;
};

const v7Paths = collect(v7Sources, null);
const v6Paths = collect(v6Sources, /^\/v6/);
const v5Paths = collect(v5Sources, /^\/v5/);
const allPaths = new Set([...v7Paths, ...v6Paths, ...v5Paths]);

export const missingVersionPaths = {
  v7: [...allPaths].filter(path => !v7Paths.has(path)),
  v6: [...allPaths].filter(path => !v6Paths.has(path)),
  v5: [...allPaths].filter(path => !v5Paths.has(path)),
};
