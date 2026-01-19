import { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';
import { OpenResponsesApiRequestBody } from './open-responses-api';

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

  return { input, warnings };
}
