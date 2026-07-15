import { v6Source, v7Source } from './source';

const stablePaths = new Set(
  v6Source.source.getPages('en').map(page => page.url),
);
const canaryPaths = new Set(
  v7Source.source.getPages('en').map(page => page.url.replace(/^\/v7/, '')),
);

export const missingVersionPaths = {
  v6: [...canaryPaths].filter(path => !stablePaths.has(path)),
  v7: [...stablePaths].filter(path => !canaryPaths.has(path)),
};
