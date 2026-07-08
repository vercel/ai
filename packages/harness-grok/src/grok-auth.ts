export type GrokAuthOptions = {
  readonly apiKey?: string;
};

export function resolveGrokEnv(auth?: GrokAuthOptions): Record<string, string> {
  const apiKey = auth?.apiKey ?? process.env.XAI_API_KEY;
  if (!apiKey) return {};
  return { XAI_API_KEY: apiKey };
}

export function resolveGrokAuthMethodId(auth?: GrokAuthOptions): "xai.api_key" | "xai.oauth" {
  const apiKey = auth?.apiKey ?? process.env.XAI_API_KEY;
  return apiKey ? "xai.api_key" : "xai.oauth";
}