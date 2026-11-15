export function getRuntimeEnvironmentUserAgent(
  globalThisAny: any = globalThis as any,
): string {
  // Browsers / Cloudflare Workers / Deno / Bun / Node.js >= 21.1
  if (globalThisAny.navigator?.userAgent) {
    return globalThisAny.navigator.userAgent.toLowerCase();
  }

  // Node.js < 21.1
  if (globalThisAny.process?.versions?.node) {
    return `node.js/${globalThisAny.process.version}`;
  }

  if (globalThisAny.EdgeRuntime) {
    return 'vercel-edge';
  }

  return '';
}
