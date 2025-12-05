import { JSONObject, LanguageModelV3FunctionTool } from '@ai-sdk/provider';
import { LanguageModelMiddleware } from '../types';

function defaultFormatExample(example: { input: JSONObject }): string {
  return JSON.stringify(example.input);
}

/**
 * Middleware that appends input examples to tool descriptions.
 *
 * This is useful for providers that don't natively support the `inputExamples`
 * property. The middleware serializes examples into the tool's description text.
 *
 * @param options - Configuration options for the middleware.
 * @param options.description - A description/header to prepend before the examples.
 * @param options.formatExample - Optional custom formatter for each example.
 *   Receives the example object and its index. Default: JSON.stringify(example.input)
 *
 * @example
 * ```ts
 * import { wrapLanguageModel, toolInputExamplesMiddleware } from 'ai';
 *
 * const model = wrapLanguageModel({
 *   model: yourModel,
 *   middleware: toolInputExamplesMiddleware({
 *     description: 'Input Examples:',
 *   }),
 * });
 * ```
 */
export function toolInputExamplesMiddleware({
  description,
  formatExample = defaultFormatExample,
}: {
  /**
   * A description/header to prepend before the examples.
   */
  description: string;

  /**
   * Optional custom formatter for each example.
   * Receives the example object and its index.
   * Default: JSON.stringify(example.input)
   */
  formatExample?: (example: { input: JSONObject }, index: number) => string;
}): LanguageModelMiddleware {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!params.tools?.length) {
        return params;
      }

      const transformedTools = params.tools.map(tool => {
        // Only transform function tools that have inputExamples
        if (tool.type !== 'function' || !tool.inputExamples?.length) {
          return tool;
        }

        const formattedExamples = tool.inputExamples
          .map((example, index) => formatExample(example, index))
          .join('\n');

        const examplesSection = `${description}\n${formattedExamples}`;

        const toolDescription = tool.description
          ? `${tool.description}\n\n${examplesSection}`
          : examplesSection;

        return {
          ...tool,
          description: toolDescription,
        } satisfies LanguageModelV3FunctionTool;
      });

      return {
        ...params,
        tools: transformedTools,
      };
    },
  };
}
