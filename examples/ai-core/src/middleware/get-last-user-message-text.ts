import { LanguageModelV1Prompt } from 'ai';

export function getLastUserMessageText({
  prompt,
}: {
  prompt: LanguageModelV1Prompt;
}): string | undefined {
  const lastMessage = prompt.at(-1);

  if (lastMessage?.role !== 'user') {
    return undefined;
  }

  return lastMessage.content.length === 0
    ? undefined
    : lastMessage.content.filter(c => c.type === 'text').join('\n');
}
