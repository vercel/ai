import { ChatPrompt } from './chat-prompt';
import { InstructionPrompt } from './instruction-prompt';

export function convertToChatPrompt(
  prompt: InstructionPrompt | ChatPrompt,
): ChatPrompt {
  if (typeof prompt === 'string') {
    return {
      messages: [{ role: 'user', content: prompt }],
    };
  }

  if ('instruction' in prompt) {
    return {
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.instruction }],
    };
  }

  return prompt;
}
