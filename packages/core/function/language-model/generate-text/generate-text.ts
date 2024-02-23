import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';

/**
 * Generate a text using a language model.
 */
export async function generateText({
  model,
  prompt,
}: {
  model: LanguageModel;
  prompt: string | InstructionPrompt | ChatPrompt;
}): Promise<string> {
  const modelResponse = await model.generate({ prompt });

  return modelResponse.text;
}
