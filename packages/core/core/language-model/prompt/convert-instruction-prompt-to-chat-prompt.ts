import { ChatPrompt } from './chat-prompt';
import { InstructionPrompt } from './instruction-prompt';

export function convertInstructionPromptToChatPrompt(
  prompt: InstructionPrompt,
): ChatPrompt {
  if (typeof prompt === 'string') {
    return {
      messages: [{ role: 'user', content: prompt }],
    };
  }

  return {
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.instruction }],
  };
}
