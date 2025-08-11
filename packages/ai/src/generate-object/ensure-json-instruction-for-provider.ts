import { JSONSchema7 } from '@ai-sdk/provider';
import { injectJsonInstruction } from './inject-json-instruction';
import { StandardizedPrompt } from '../prompt/standardize-prompt';

/**
Ensures a JSON instruction is present for providers that require it when using
response_format json_object. Currently applies to DeepSeek's OpenAI-compatible API.
*/
export function ensureJsonInstructionForProvider({
  prompt,
  provider,
  jsonSchema,
}: {
  prompt: StandardizedPrompt;
  provider: string;
  jsonSchema?: JSONSchema7;
}): StandardizedPrompt {
  if (provider !== 'deepseek.chat') {
    return prompt;
  }

  const first = prompt.messages[0];
  const isSingleSimpleUserText =
    prompt.messages.length === 1 &&
    first?.role === 'user' &&
    typeof first.content === 'string';

  const instruction = injectJsonInstruction({
    prompt: isSingleSimpleUserText ? (first.content as string) : undefined,
    schema: jsonSchema,
  });

  return isSingleSimpleUserText
    ? { ...prompt, messages: [{ role: 'user', content: instruction }] }
    : {
        ...prompt,
        messages: [...prompt.messages, { role: 'user', content: instruction }],
      };
}
