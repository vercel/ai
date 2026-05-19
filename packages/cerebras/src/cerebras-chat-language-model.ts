import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV3CallOptions,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';

function isStructuredOutputWithToolCallsFinishReason({
  rawFinishReason,
  hasText,
  responseFormatType,
}: {
  rawFinishReason: string | undefined;
  hasText: boolean;
  responseFormatType:
    | NonNullable<LanguageModelV3CallOptions['responseFormat']>['type']
    | undefined;
}) {
  return (
    responseFormatType === 'json' && rawFinishReason === 'tool_calls' && hasText
  );
}

export class CerebrasChatLanguageModel extends OpenAICompatibleChatLanguageModel {
  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const result = await super.doGenerate(options);

    if (
      !isStructuredOutputWithToolCallsFinishReason({
        rawFinishReason: result.finishReason.raw,
        hasText: result.content.some(
          part => part.type === 'text' && part.text.length > 0,
        ),
        responseFormatType: options.responseFormat?.type,
      })
    ) {
      return result;
    }

    return {
      ...result,
      // Cerebras GLM can return valid structured output text while also
      // repeating a tool call. Treat that mixed response as the final answer.
      content: result.content.filter(part => part.type !== 'tool-call'),
      finishReason: {
        ...result.finishReason,
        unified: 'stop',
      },
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const result = await super.doStream(options);
    let hasText = false;

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
        >({
          transform(part, controller) {
            if (part.type === 'text-delta' && part.delta.length > 0) {
              hasText = true;
            }

            if (
              part.type === 'finish' &&
              isStructuredOutputWithToolCallsFinishReason({
                rawFinishReason: part.finishReason.raw,
                hasText,
                responseFormatType: options.responseFormat?.type,
              })
            ) {
              controller.enqueue({
                ...part,
                finishReason: {
                  ...part.finishReason,
                  unified: 'stop',
                },
              });
              return;
            }

            if (
              options.responseFormat?.type === 'json' &&
              hasText &&
              (part.type === 'tool-input-start' ||
                part.type === 'tool-input-delta' ||
                part.type === 'tool-input-end' ||
                part.type === 'tool-call')
            ) {
              return;
            }

            controller.enqueue(part);
          },
        }),
      ),
    };
  }
}
