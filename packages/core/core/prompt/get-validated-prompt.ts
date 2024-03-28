import { InvalidPromptError } from '../../spec';
import { ExperimentalMessage } from './message';
import { Prompt } from './prompt';

export type ValidatedPrompt =
  | {
      type: 'prompt';
      prompt: string;
      messages: undefined;
      system?: string;
    }
  | {
      type: 'messages';
      prompt: undefined;
      messages: ExperimentalMessage[];
      system?: string;
    };

export function getValidatedPrompt(prompt: Prompt): ValidatedPrompt {
  if (prompt.prompt == null && prompt.messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt or messages must be defined',
    });
  }

  if (prompt.prompt != null && prompt.messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: 'prompt and messages cannot be defined at the same time',
    });
  }

  return prompt.prompt != null
    ? {
        type: 'prompt',
        prompt: prompt.prompt,
        messages: undefined,
        system: prompt.system,
      }
    : {
        type: 'messages',
        prompt: undefined,
        messages: prompt.messages!, // only possible case bc of checks above
        system: prompt.system,
      };
}
