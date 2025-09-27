import { getContext } from '#oidc';
export { getVercelOidcToken } from '#oidc';

export async function getVercelRequestId(): Promise<string | undefined> {
  return getContext().headers?.['x-vercel-id'];
}
