import { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';
import { InputFileContentParam, InputImageContentParam, InputTextContentParam, OpenResponsesApiRequestBody } from './open-responses-api';

export async function convertToOpenResponsesInput({
  prompt,
}: {
  prompt: LanguageModelV3Prompt;
}): Promise<{
  input: OpenResponsesApiRequestBody['input'];
  warnings: Array<SharedV3Warning>;
}> {
  const input: OpenResponsesApiRequestBody['input'] = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'user': {
        const userContent: Array<InputTextContentParam | InputImageContentParam | InputFileContentParam> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              userContent.push({ type: 'input_text', text: part.text });
              break;
            }
          }
        }

        input.push({ type: 'message', role: 'user', content: userContent });
        break;
      }
    }
  }

  return { input, warnings };
}
