import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';

export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
}: {
  tagName: string;
  separator?: string;
}): Experimental_LanguageModelV1Middleware {
  return {
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const result = await doGenerate();

      if (result.text == null) {
        return result;
      }

      const regexp = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 'gs');
      const matches = Array.from(result.text.matchAll(regexp));

      if (matches.length > 0) {
        // Combine all reasoning parts with the specified separator
        result.reasoning = matches.map(match => match[1]).join(separator);

        // Remove all reasoning tags from the text and join remaining parts with separator
        const parts = result.text
          .split(new RegExp(`<${tagName}>.*?<\/${tagName}>`, 'gs'))
          .filter(part => part.trim().length > 0);
        result.text = parts.join(separator).trim();
      }

      return result;
    },
  };
}
