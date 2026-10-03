import type { AnthropicHeaders } from '../anthropic-language-model-options';

export const fromAnthropicHeaders = (headers: AnthropicHeaders | undefined) => {
  if (!headers) return {};
  return Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value != null) {
        acc[key] = Array.isArray(value) ? value.join(',') : value;
      }
      return acc;
    },
    {} as Record<string, string | undefined>,
  );
};
