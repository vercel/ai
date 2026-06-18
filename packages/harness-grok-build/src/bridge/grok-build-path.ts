import path from 'node:path';

const fallbackPath =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

// Prepend the bootstrap's node_modules/.bin to PATH so the installed `grok` wins.
export function prependGrokBuildBinToPath({
  bootstrapDir,
  env,
}: {
  bootstrapDir: string;
  env: NodeJS.ProcessEnv;
}): void {
  env.PATH = [
    path.join(bootstrapDir, 'node_modules', '.bin'),
    env.PATH || fallbackPath,
  ].join(path.delimiter);
}
