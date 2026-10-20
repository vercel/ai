import { createHmac, randomBytes } from 'node:crypto';

let bridgeTokenSecret: string | Buffer | undefined;

export function mintBridgeToken(sandboxId: string): string {
  bridgeTokenSecret ??=
    process.env.HARNESS_BRIDGE_TOKEN_SECRET || randomBytes(32);

  return createHmac('sha256', bridgeTokenSecret)
    .update(sandboxId)
    .digest('hex');
}
