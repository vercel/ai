/**
 * Read a required environment variable, failing with a usable message instead
 * of letting `undefined` flow into a URL or a request body.
 *
 * Set these in `examples/ai-functions/.env` (or otherwise in the environment).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}
