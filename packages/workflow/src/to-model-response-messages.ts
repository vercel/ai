import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { GenerateTextResult } from 'ai';

/** Convert provider file references back to public message data without re-running tool output hooks. */
export function toModelResponseMessages(
  messages: LanguageModelV4Prompt,
): GenerateTextResult<any, any, any>['responseMessages'] {
  return messages.map(message =>
    message.role !== 'assistant'
      ? message
      : {
          ...message,
          content: message.content.map(part => {
            if (part.type !== 'file' && part.type !== 'reasoning-file')
              return part;
            return {
              ...part,
              data:
                part.data.type === 'data'
                  ? part.data.data
                  : part.data.type === 'url'
                    ? part.data.url
                    : part.data,
            };
          }),
        },
  ) as GenerateTextResult<any, any, any>['responseMessages'];
}
