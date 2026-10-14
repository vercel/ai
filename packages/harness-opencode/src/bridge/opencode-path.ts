import path from 'node:path';
import { rgPath } from '@vscode/ripgrep';

const fallbackPath =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

export function configureOpenCodePath({
  bootstrapDir,
  env,
}: {
  bootstrapDir: string;
  env: NodeJS.ProcessEnv;
}): void {
  env.PATH = [
    path.join(bootstrapDir, 'node_modules', '.bin'),
    env.PATH || fallbackPath,
    path.dirname(rgPath),
  ].join(path.delimiter);
}
