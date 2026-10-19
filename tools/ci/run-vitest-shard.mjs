import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const shard = process.env.VITEST_SHARD;
if (shard && !/^[1-4]\/4$/.test(shard)) {
  throw new Error(`Invalid VITEST_SHARD: ${shard}; expected 1/4 through 4/4`);
}

// Keep shard selection out of Turbo's command-line arguments: passthrough
// arguments also change prerequisite build hashes, even for other packages.
const result = spawnSync(
  process.execPath,
  [vitest, '--config', process.argv[2], '--run', ...(shard ? ['--shard', shard] : []), ...process.argv.slice(3)],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
