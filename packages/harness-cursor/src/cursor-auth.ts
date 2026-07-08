export type CursorAuthOptions = {
  readonly apiKey?: string;
};

export function resolveCursorEnv(auth?: CursorAuthOptions): Record<string, string> {
  const apiKey = auth?.apiKey ?? process.env.CURSOR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Cursor harness requires CURSOR_API_KEY (env) or createCursor({ auth: { apiKey } }).",
    );
  }
  return { CURSOR_API_KEY: apiKey };
}