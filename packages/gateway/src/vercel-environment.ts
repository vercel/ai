/**
 * Lazily imports `@vercel/oidc` to avoid module resolution failures in
 * environments where the package cannot be resolved (e.g. React Native
 * with Metro bundler — see https://github.com/vercel/ai/issues/12313).
 *
 * `@vercel/oidc` is only functional inside Vercel Functions, so it is
 * safe to return graceful fallbacks when the module is unavailable.
 */
async function loadVercelOidc(): Promise<
  typeof import('@vercel/oidc') | undefined
> {
  try {
    return await import('@vercel/oidc');
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot find module')
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function getVercelOidcToken(): Promise<string> {
  const oidc = await loadVercelOidc();
  if (!oidc) {
    throw new Error(
      '@vercel/oidc is not available in this environment. ' +
        'Provide an API key via the AI_GATEWAY_API_KEY environment variable instead.',
    );
  }
  return oidc.getVercelOidcToken();
}

export async function getVercelRequestId(): Promise<string | undefined> {
  const oidc = await loadVercelOidc();
  return oidc?.getContext().headers?.['x-vercel-id'];
}
