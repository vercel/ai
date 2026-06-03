/*
 * Copies the cross-compiled proxy binaries produced by the vendored Go build
 * (`go/scripts/build-binaries.sh`, which writes to `go/public/`) into this
 * package's `bin/` directory, where `src/proxy-binary.ts` reads them at runtime.
 *
 * The Go package is vendored verbatim, so its build script is not modified to
 * target this layout; this collector bridges the two. The committed binaries in
 * `bin/` are the source of truth — rebuilding is only needed when the Go source
 * changes.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'go', 'public');
const to = join(root, 'bin');

mkdirSync(to, { recursive: true });
for (const [src, dest] of [
  ['linux-x86_64', 'http-proxy-server-linux-x86_64'],
  ['linux-arm64', 'http-proxy-server-linux-arm64'],
]) {
  copyFileSync(join(from, src), join(to, dest));
  console.log(`collected ${src} -> bin/${dest}`);
}
