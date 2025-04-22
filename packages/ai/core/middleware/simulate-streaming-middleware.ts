import type {
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

/**
 * Simulates streaming chunks with the response from a generate call.
 */
export function simulateStreamingMiddleware(): LanguageModelV2Middleware {
  return {
    middlewareVersion: 'v2',
    wrapStream: async ({ doGenerate }) => {
      const result = await doGenerate();

      const simulatedStream = new ReadableStream<LanguageModelV2StreamPart>({
        start(controller) {
          controller.enqueue({
            type: 'stream-start',
            warnings: result.warnings,
          });

          controller.enqueue({ type: 'response-metadata', ...result.response });

          for (const part of result.content) {
            controller.enqueue(part);
          }

          controller.enqueue({
            type: 'finish',
            finishReason: result.finishReason,
            usage: result.usage,
            providerMetadata: result.providerMetadata,
          });

          controller.close();
        },
      });

      return {
        stream: simulatedStream,
        request: result.request,
        response: result.response,
      };
    },
  };
}
