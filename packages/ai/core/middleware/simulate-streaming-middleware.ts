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
          controller.enqueue({ type: 'response-metadata', ...result.response });

          if (result.reasoning) {
            for (const reasoningPart of result.reasoning) {
              controller.enqueue(reasoningPart);
            }
          }

          if (result.text) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: result.text,
            });
          }

          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              controller.enqueue({
                type: 'tool-call-delta',
                toolCallType: 'function',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                argsTextDelta: toolCall.args,
              });

              controller.enqueue(toolCall);
            }
          }

          controller.enqueue({
            type: 'finish',
            finishReason: result.finishReason,
            usage: result.usage,
            logprobs: result.logprobs,
            providerMetadata: result.providerMetadata,
          });

          controller.close();
        },
      });

      return {
        stream: simulatedStream,
        request: result.request,
        response: result.response,
        warnings: result.warnings,
      };
    },
  };
}
