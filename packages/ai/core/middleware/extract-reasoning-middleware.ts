import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';

export function extractReasoningMiddleware({
  tagName,
}: {
  tagName: string;
}): Experimental_LanguageModelV1Middleware {
  return {
    wrapGenerate: async ({ doGenerate, params, model }) => {
      const result = await doGenerate();

      if (result.text == null) {
        return result;
      }

      const regexp = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's');

      const match = result.text.match(regexp);

      if (match) {
        result.reasoning = match[1];
        result.text = result.text.replace(match[0], '').trim();
      }

      return result;
    },
  };
}
