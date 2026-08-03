import { v6Sources, v7Sources } from './source';

const collect = (
  bundles: typeof v6Sources,
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

const v6Paths = collect(v6Sources, null);
const v7Paths = collect(v7Sources, /^\/v7/);

export const missingVersionPaths = {
  v6: [...v7Paths].filter(path => !v6Paths.has(path)),
  v7: [...v6Paths].filter(path => !v7Paths.has(path)),
};
