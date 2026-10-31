export const providers = {
  openai: {
    name: 'OpenAI',
    keyNames: ['OPENAI_API_KEY'],
    models: [{ id: 'gpt-4.1-mini', name: 'GPT-4.1 mini' }],
  },
  google: {
    name: 'Google Gemini',
    keyNames: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
  },
  anthropic: {
    name: 'Anthropic Claude',
    keyNames: ['ANTHROPIC_API_KEY'],
    models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
  },
} as const;

export type ProviderId = keyof typeof providers;
export type AssistantMode = 'chat' | 'research' | 'tasks';

export function getProviderApiKey(provider: ProviderId) {
  for (const keyName of providers[provider].keyNames) {
    const value = process.env[keyName];
    if (value) return { keyName, value };
  }
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in providers;
}

export function isAssistantMode(value: unknown): value is AssistantMode {
  return value === 'chat' || value === 'research' || value === 'tasks';
}

export function isModelForProvider(
  provider: ProviderId,
  model: string,
): boolean {
  return providers[provider].models.some(option => option.id === model);
}
