import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

export function loadEnvFiles(options: { entrypointUrl: string }) {
  const entrypointDir = dirname(fileURLToPath(options.entrypointUrl));
  const cwd = process.cwd();
  const dirs = entrypointDir === cwd ? [entrypointDir] : [entrypointDir, cwd];
  const envFiles = ['.env.local', '.env'];
  const loaded = new Set<string>();

  for (const dir of dirs) {
    for (const envFile of envFiles) {
      const path = `${dir}/${envFile}`;
      if (loaded.has(path) || !existsSync(path)) {
        continue;
      }
      config({ path });
      loaded.add(path);
    }
  }
}
