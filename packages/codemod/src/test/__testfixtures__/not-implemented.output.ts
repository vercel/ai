// @ts-nocheck
import {
  streamText,
  convertToModelMessages,
  appendClientMessage,
  appendResponseMessages,
} from 'ai';
import { openai } from '@ai-sdk/openai';

/*FIXME(@ai-sdk-codemod-error): The `appendClientMessage` option has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#message-persistence-changes*/
const updatedMessages = appendClientMessage({
  messages,
  message: lastUserMessage,
});

const result = streamText({
  model: openai('gpt-4o'),
  messages: updatedMessages,
  experimental_generateMessageId: () => generateId(), // ID generation on streamText
  onFinish: async ({ responseMessages, usage }) => {
    // Use helper functions to format messages
    /*FIXME(@ai-sdk-codemod-error): The `appendResponseMessages` option has been removed. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#message-persistence-changes*/
    const finalMessages = appendResponseMessages({
      messages: updatedMessages,
      responseMessages,
    });

    // Save formatted messages to database
    await saveMessages(finalMessages);
  },
});