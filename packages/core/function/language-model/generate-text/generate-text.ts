import { LanguageModel } from '../language-model';
import { LanguageModelPrompt } from '../prompt';

/**
 * Generate a text using a language model.
 */
export async function generateText({
  model,
  prompt,
}: {
  model: LanguageModel;
  prompt: LanguageModelPrompt;
}): Promise<GenerateTextResult> {
  const modelResponse = await model.doGenerate({ prompt });

  return new GenerateTextResult(modelResponse);
}

export class GenerateTextResult {
  readonly text: string;

  constructor(modelResponse: { text: string }) {
    this.text = modelResponse.text;
  }
}
