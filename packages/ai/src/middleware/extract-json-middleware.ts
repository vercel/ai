import type { LanguageModelV3Content } from '@ai-sdk/provider';
import { LanguageModelMiddleware } from '../types/language-model-middleware';

/**
 * Default transform function that strips markdown code fences from text.
 */
function defaultTransform(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/**
 * Middleware that extracts JSON from text content by stripping
 * markdown code fences and other formatting.
 *
 * This is useful when using Output.object() with models that wrap
 * JSON responses in markdown code blocks.
 *
 * Note: This middleware only works with generateText, not streamText.
 *
 * @param options - Configuration options for the middleware.
 * @param options.transform - Custom transform function. If provided, this will be
 * used instead of the default markdown fence stripping.
 */
export function extractJsonMiddleware(options?: {
  /**
   * Custom transform function to apply to text content.
   * Receives the raw text and should return the transformed text.
   * If not provided, the default transform strips markdown code fences.
   */
  transform?: (text: string) => string;
}): LanguageModelMiddleware {
  const transform = options?.transform ?? defaultTransform;

  return {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();

      const transformedContent: LanguageModelV3Content[] = [];
      for (const part of content) {
        if (part.type !== 'text') {
          transformedContent.push(part);
          continue;
        }

        transformedContent.push({
          ...part,
          text: transform(part.text),
        });
      }

      return { content: transformedContent, ...rest };
    },
  };
}
