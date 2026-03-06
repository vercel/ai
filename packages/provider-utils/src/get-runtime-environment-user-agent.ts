export function getRuntimeEnvironmentUserAgent(
  globalThisAny: any = globalThis as any,
): string {
  // Browsers
  if (globalThisAny.window) {
    return `runtime/browser`;
  }

  // Cloudflare Workers / Deno / Bun / Node.js >= 21.1
  if (globalThisAny.navigator?.userAgent) {
    const ua = globalThisAny.navigator.userAgent;

    // navigator.userAgent may contain product/version (e.g. "Bun/1.3.9").
    // RFC 9110 §10.1.5 only allows a single "/" between product and version,
    // so "runtime/bun/1.3.9" is invalid. Split and restructure.
    const slashIdx = ua.indexOf('/');
    if (slashIdx !== -1) {
      const product = ua.substring(0, slashIdx).toLowerCase();
      const version = ua.substring(slashIdx + 1);
      return `runtime-${product}/${version}`;
    }

    return `runtime/${ua.toLowerCase()}`;
  }

  // Nodes.js < 21.1
  if (globalThisAny.process?.versions?.node) {
    return `runtime-node/${globalThisAny.process.version.substring(0)}`;
  }

  if (globalThisAny.EdgeRuntime) {
    return `runtime/vercel-edge`;
  }

  return 'runtime/unknown';
}
