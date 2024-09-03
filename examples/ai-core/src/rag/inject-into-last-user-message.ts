import { LanguageModelV1CallOptions } from '@ai-sdk/provider';

export function injectIntoLastUserMessage({
  text,
  parameters,
}: {
  text: string;
  parameters: LanguageModelV1CallOptions;
}): LanguageModelV1CallOptions {
  const { prompt, ...rest } = parameters;

  const lastMessage = prompt.at(-1);

  if (lastMessage?.role !== 'user') {
    return parameters;
  }

  return {
    ...rest,
    prompt: [
      ...prompt.slice(0, -1),
      {
        ...lastMessage,
        content: [{ type: 'text', text }, ...lastMessage.content],
      },
    ],
  };
}
