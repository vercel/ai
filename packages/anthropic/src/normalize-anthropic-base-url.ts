/**
 * Normalize the configured Anthropic base URL so that the bare canonical host
 * (`https://api.anthropic.com`), which is the form used by the official
 * Anthropic SDK and tools like Claude Code, also resolves to the versioned
 * `/v1` prefix that this provider appends paths to.
 *
 * Any other value (custom proxies, LiteLLM gateways, hosts that already
 * include a path) is returned unchanged.
 */
export function normalizeAnthropicBaseURL(
  baseURL: string | undefined,
): string | undefined {
  if (baseURL == null) {
    return baseURL;
  }

  let url: URL;
  try {
    url = new URL(baseURL);
  } catch {
    return baseURL;
  }

  if (url.host !== 'api.anthropic.com') {
    return baseURL;
  }

  if (url.pathname !== '' && url.pathname !== '/') {
    return baseURL;
  }

  url.pathname = '/v1';
  return url.toString().replace(/\/$/, '');
}
