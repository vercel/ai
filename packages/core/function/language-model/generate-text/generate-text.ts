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
}): Promise<GenerateTextResult> {
  const modelResponse = await model.generate({ prompt });

  return new GenerateTextResult(modelResponse);
}

export class GenerateTextResult {
  readonly text: string;

  constructor(modelResponse: { text: string }) {
    this.text = modelResponse.text;
  }
}
