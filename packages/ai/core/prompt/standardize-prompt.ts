import { InvalidPromptError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { Message } from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { ToolSet } from '../generate-text/tool-set';
import { convertToCoreMessages } from './convert-to-core-messages';
import { detectPromptType } from './detect-prompt-type';
import { CoreMessage, coreMessageSchema } from './message';
import { Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * Original prompt type. This is forwarded to the providers and can be used
   * to write send raw text to providers that support it.
   */
  type: 'prompt' | 'messages';

  /**
   * System message.
   */
  system?: string;

  /**
   * Messages.
   */
  messages: CoreMessage[];
};

export function standardizePrompt<TOOLS extends ToolSet>({
  prompt,
  tools,
}: {
  prompt: Prompt;
  tools: undefined | TOOLS;
}): StandardizedPrompt {
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

  // validate that system is a string
  if (prompt.system != null && typeof prompt.system !== 'string') {
    throw new InvalidPromptError({
      prompt,
      message: 'system must be a string',
    });
  }

  // type: prompt
  if (prompt.prompt != null) {
    // validate that prompt is a string
    if (typeof prompt.prompt !== 'string') {
      throw new InvalidPromptError({
        prompt,
        message: 'prompt must be a string',
      });
    }

    return {
      type: 'prompt',
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: prompt.prompt,
        },
      ],
    };
  }

  // type: messages
  if (prompt.messages != null) {
    const promptType = detectPromptType(prompt.messages);

    if (promptType === 'other') {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must be an array of CoreMessage or UIMessage',
      });
    }

    const messages: CoreMessage[] =
      promptType === 'ui-messages'
        ? convertToCoreMessages(prompt.messages as Omit<Message, 'id'>[], {
            tools,
          })
        : (prompt.messages as CoreMessage[]);

    if (messages.length === 0) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must not be empty',
      });
    }

    const validationResult = safeValidateTypes({
      value: messages,
      schema: z.array(coreMessageSchema),
    });

    if (!validationResult.success) {
      throw new InvalidPromptError({
        prompt,
        message: 'messages must be an array of CoreMessage or UIMessage',
        cause: validationResult.error,
      });
    }

    return {
      type: 'messages',
      messages,
      system: prompt.system,
    };
  }

  throw new Error('unreachable');
}
