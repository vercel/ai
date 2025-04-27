import { InvalidPromptError } from '@ai-sdk/provider';
import { safeValidateTypes } from '@ai-sdk/provider-utils';
import { Message } from '../types';
import { z } from 'zod';
import { ToolSet } from '../generate-text/tool-set';
import { convertToCoreMessages } from './convert-to-core-messages';
import { detectPromptType } from './detect-prompt-type';
import { CoreMessage, coreMessageSchema } from './message';
import { Prompt } from './prompt';

export type StandardizedPrompt = {
  /**
   * System message.
   */
  system?: string;

  /**
   * Messages.
   */
  messages: CoreMessage[];
};

export async function standardizePrompt<TOOLS extends ToolSet>({
  prompt,
  tools,
}: {
  prompt: Prompt;
  tools: undefined | TOOLS;
}): Promise<StandardizedPrompt> {
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

    const validationResult = await safeValidateTypes({
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
      messages,
      system: prompt.system,
    };
  }

  throw new Error('unreachable');
}
