import { LanguageModelV3Prompt } from '@ai-sdk/provider';

export function convertToOpenAICompatibleChatMessages(prompt: LanguageModelV3Prompt) {
  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content: content[0].text });
        break;
      }
      case 'user': {
        const textContent = content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('');
        messages.push({ role: 'user', content: textContent });
        break;
      }
      case 'assistant': {
        const textContent = content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('');
        messages.push({ role: 'assistant', content: textContent });
        break;
      }
    }
  }

  return messages;
}
