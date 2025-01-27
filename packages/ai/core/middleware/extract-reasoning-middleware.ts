import { Experimental_LanguageModelV1Middleware } from './language-model-v1-middleware';

export function extractReasoningMiddleware({
  tagName,
  separator = '\n',
}: {
  tagName: string;
  separator?: string;
}): Experimental_LanguageModelV1Middleware {
  return {
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();

      if (result.text == null) {
        return result;
      }

      const regexp = new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 'gs');
      const matches = Array.from(result.text.matchAll(regexp));

      if (!matches.length) {
        return result;
      }

      result.reasoning = matches.map(match => match[1]).join(separator);

      let textWithoutReasoning = result.text;
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];

        const beforeMatch = textWithoutReasoning.slice(0, match.index);
        const afterMatch = textWithoutReasoning.slice(
          match.index! + match[0].length,
        );

        textWithoutReasoning =
          beforeMatch +
          (beforeMatch.length > 0 && afterMatch.length > 0 ? separator : '') +
          afterMatch;
      }

      result.text = textWithoutReasoning;

      return result;
    },
  };
}
