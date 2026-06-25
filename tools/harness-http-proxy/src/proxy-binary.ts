/**
 * Resolves and reads the vendored Go proxy binary for a given sandbox
 * architecture. Ported verbatim from
 * `agent-harness-sdk/packages/ws-proxy/src/proxy-binary.ts`; the binaries it
 * reads live in this package's `bin/` directory.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROXY_BINARY_BY_ARCH = {
  x86_64: '../bin/http-proxy-server-linux-x86_64',
  arm64: '../bin/http-proxy-server-linux-arm64',
} as const;

type ProxyBinaryArch = keyof typeof PROXY_BINARY_BY_ARCH;

export function normalizeLinuxProxyArch(
  arch: string | undefined,
): ProxyBinaryArch | undefined {
  switch (arch?.trim().toLowerCase()) {
    case 'amd64':
    case 'x64':
    case 'x86_64':
      return 'x86_64';
    case 'aarch64':
    case 'arm64':
      return 'arm64';
    default:
      return;
  }
}

export function getHostLinuxProxyArch(): ProxyBinaryArch {
  return normalizeLinuxProxyArch(process.arch) ?? 'x86_64';
}

export function getProxyBinaryPath(arch?: string): string {
  const guestArch = normalizeLinuxProxyArch(arch) ?? getHostLinuxProxyArch();
  return fileURLToPath(
    new URL(PROXY_BINARY_BY_ARCH[guestArch], import.meta.url),
  );
}

export function readProxyBinary(arch?: string): Buffer {
  return readFileSync(getProxyBinaryPath(arch));
}
