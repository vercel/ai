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
            if (typeof result.reasoning === 'string') {
              controller.enqueue({
                type: 'reasoning',
                textDelta: result.reasoning,
              });
            } else {
              for (const reasoning of result.reasoning) {
                switch (reasoning.type) {
                  case 'text': {
                    controller.enqueue({
                      type: 'reasoning',
                      textDelta: reasoning.text,
                    });
                    if (reasoning.signature != null) {
                      controller.enqueue({
                        type: 'reasoning-signature',
                        signature: reasoning.signature,
                      });
                    }
                    break;
                  }
                  case 'redacted': {
                    controller.enqueue({
                      type: 'redacted-reasoning',
                      data: reasoning.data,
                    });
                    break;
                  }
                }
              }
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

              controller.enqueue({
                type: 'tool-call',
                ...toolCall,
              });
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
        rawCall: result.rawCall,
        rawResponse: result.response,
        warnings: result.warnings,
      };
    },
  };
}
