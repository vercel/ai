import { Message } from 'ai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';

export function asOpenAIMessages(
  messages: Message[],
): ChatCompletionMessageParam[] {
  return messages.map(message => {
    switch (message.role) {
      case 'system':
      case 'user':
        return {
          role: message.role,
          content: message.content,
        } satisfies ChatCompletionMessageParam;

      case 'assistant': {
        const function_call = message.function_call;

        if (
          function_call !== undefined &&
          (typeof function_call === 'string' ||
            function_call.arguments === undefined ||
            function_call.name === undefined)
        ) {
          throw new Error(
            'Invalid function call in message. Expected a function call object',
          );
        }

        return {
          role: message.role,
          content: message.content,
          function_call:
            function_call === undefined
              ? undefined
              : {
                  name: function_call.name!,
                  arguments: function_call.arguments!,
                },
        } satisfies ChatCompletionMessageParam;
      }

      case 'function': {
        if (message.name === undefined) {
          throw new Error('Invalid function call in message. Expected a name');
        }

        return {
          role: message.role,
          content: message.content,
          name: message.name,
        } satisfies ChatCompletionMessageParam;
      }
    }
  });
}
