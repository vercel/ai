/**
 * ONE-TIME: build & register a Tensorlake image that includes `pnpm`, which the
 * Claude Code harness needs on PATH to bootstrap itself. The default Tensorlake
 * image ships node/npm/git but NOT pnpm, and the non-root `tl-user` cannot
 * install it onto any PATH directory at runtime (all are read-only) — so it
 * must be baked into the image.
 *
 *   TENSORLAKE_API_KEY=... pnpm tsx scripts/build-image.ts
 *
 * Re-running rebuilds/overwrites the `claude-harness` registered image. The
 * build runs remotely and can take a few minutes; progress prints to stderr.
 */
import { Image } from 'tensorlake';

async function main() {
  if (!process.env.TENSORLAKE_API_KEY) {
    throw new Error('TENSORLAKE_API_KEY is not set.');
  }

  console.log('Building image "claude-harness" (this can take a few minutes)…');
  const result = await new Image({
    name: 'claude-harness',
    baseImage: 'tensorlake/ubuntu-minimal',
  })
    .run('apt-get update && apt-get install -y curl git ca-certificates')
    .run(
      'curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs',
    )
    .run('npm install -g pnpm@10') // lands in /usr/bin, already on PATH
    .build({ registeredName: 'claude-harness', verbose: true });

  console.log('\n✅ Built and registered:', JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('\n✖ image build failed:', err);
  process.exit(1);
});
