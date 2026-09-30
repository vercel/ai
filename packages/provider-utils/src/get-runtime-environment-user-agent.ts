export function getRuntimeEnvironmentUserAgent(
  globalThisAny: any = globalThis as any,
): string {
  // Browsers
  if (globalThisAny.window) {
    return `runtime/browser`;
  }

  // Cloudflare Workers / Deno / Bun / Node.js >= 21.1
  if (globalThisAny.navigator?.userAgent) {
    // Sanitize the user agent to comply with RFC 9110 User-Agent format.
    // The user agent may contain characters that are invalid in a token
    // (e.g., "Bun/1.3.9" contains a slash which is only allowed as a
    // product/version separator). Replace invalid characters with dashes.
    const sanitizedUserAgent = globalThisAny.navigator.userAgent
      .toLowerCase()
      .replace(/[^a-z0-9._~-]/g, '-');
    return `runtime/${sanitizedUserAgent}`;
  }

  // Nodes.js < 21.1
  if (globalThisAny.process?.versions?.node) {
    return `runtime/node.js/${globalThisAny.process.version.substring(0)}`;
  }

  if (globalThisAny.EdgeRuntime) {
    return `runtime/vercel-edge`;
  }

  return 'runtime/unknown';
}
