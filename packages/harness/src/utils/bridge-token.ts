import { randomBytes } from 'node:crypto';
import type { HarnessV1PortEndpoint } from '../v1';

export function createBridgeToken(): string {
  return randomBytes(32).toString('hex');
}

export function withBridgeToken({
  endpoint,
  token,
}: {
  endpoint: HarnessV1PortEndpoint;
  token: string;
}): HarnessV1PortEndpoint {
  const bridgeUrl = new URL(endpoint.url);
  bridgeUrl.searchParams.set('agent_bridge_token', token);
  return { ...endpoint, url: bridgeUrl.toString() };
}
