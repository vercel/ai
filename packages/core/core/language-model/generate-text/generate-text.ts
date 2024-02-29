import { LanguageModel } from '../language-model';
import { ChatPrompt } from '../prompt/chat-prompt';
import { convertToChatPrompt } from '../prompt/convert-to-chat-prompt';
import { InstructionPrompt } from '../prompt/instruction-prompt';

/**
 * Generate a text using a language model.
 */
export async function generateText({
  model,
  prompt,
}: {
  model: LanguageModel;
  prompt: InstructionPrompt | ChatPrompt;
}): Promise<GenerateTextResult> {
  const modelResponse = await model.doGenerate({
    mode: { type: 'regular' },
    prompt: convertToChatPrompt(prompt),
  });

  return new GenerateTextResult(modelResponse);
}

type ModelResponse = Awaited<ReturnType<LanguageModel['doGenerate']>>;

export class GenerateTextResult {
  readonly text: string;

  constructor(modelResponse: ModelResponse) {
    this.text = modelResponse.text ?? ''; // TODO throw exception if nothing got generated?
  }
}
