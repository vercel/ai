import { randomBytes } from 'node:crypto';

export function configureOpenCodeServerAuth({
  env,
}: {
  env: Record<string, string | undefined>;
}): { Authorization: string } {
  const username = env.OPENCODE_SERVER_USERNAME ?? 'opencode';
  const password = randomBytes(32).toString('hex');
  env.OPENCODE_SERVER_PASSWORD = password;

  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}
