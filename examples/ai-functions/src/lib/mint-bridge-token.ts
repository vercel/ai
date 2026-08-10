import { createHmac } from 'node:crypto';

export function mintBridgeToken(sandboxId: string): string {
  const secret = process.env.HARNESS_BRIDGE_TOKEN_SECRET;
  if (secret == null || secret.length === 0) {
    throw new Error('HARNESS_BRIDGE_TOKEN_SECRET is required.');
  }
  return createHmac('sha256', secret).update(sandboxId).digest('hex');
}
