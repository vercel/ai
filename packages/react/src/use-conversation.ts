import { generateId, Schema } from '@ai-sdk/ui-utils';
import { useCallback, useState } from 'react';
import { z } from 'zod';

type FlexibleSchema = z.ZodTypeAny | Schema<any>;

export type inferFlexibleSchema<PARAMETERS extends FlexibleSchema> =
  PARAMETERS extends Schema<any>
    ? PARAMETERS['_type']
    : PARAMETERS extends z.ZodTypeAny
    ? z.infer<PARAMETERS>
    : never;

export type InDevelopment_Content = InDevelopment_TextContent;

export type InDevelopment_TextContent = {
  type: 'text';
  // id: string;
  text: string;
};

export type InDevelopment_UIMessage<METADATA> = {
  /**
ID of the message.
   */
  id: string;

  role: 'user' | 'assistant';

  // TODO should we include a role?
  metadata: METADATA;

  // TODO
  // status: 'pending' | 'success' | 'error';

  content: Array<InDevelopment_Content>;
};

function useConversation<MESSAGE_METADATA extends FlexibleSchema>({
  api,
  messageMetadata,
}: {
  api: {
    send: (options: {
      messages: Array<
        InDevelopment_UIMessage<inferFlexibleSchema<MESSAGE_METADATA>>
      >;
    }) => AsyncIterable<{
      type: 'text-delta';
      delta: string;
    }>;
  };
  messageMetadata: MESSAGE_METADATA;
}): {
  messages: Array<
    InDevelopment_UIMessage<inferFlexibleSchema<MESSAGE_METADATA>>
  >;
  submitMessage: (options: {
    text: string;
    metadata: inferFlexibleSchema<MESSAGE_METADATA>;
  }) => void;
} {
  const [messages, setMessages] = useState<
    Array<InDevelopment_UIMessage<inferFlexibleSchema<MESSAGE_METADATA>>>
  >([]);

  // TODO should immediately return
  const submitMessage = useCallback(
    async ({
      text,
      metadata,
    }: {
      text: string;
      metadata: inferFlexibleSchema<MESSAGE_METADATA>;
    }) => {
      try {
        // add user message
        messages.push({
          role: 'user',
          id: generateId(),
          content: [{ type: 'text', text }],
          metadata,
        });

        const inputMessages = structuredClone(messages);

        // add the assistant message
        const assistantMessage: InDevelopment_UIMessage<
          inferFlexibleSchema<MESSAGE_METADATA>
        > = {
          role: 'assistant',
          id: generateId(),
          content: [],
          metadata,
        };
        messages.push(assistantMessage);

        setMessages(structuredClone(messages));

        const stream = api.send({ messages: inputMessages });

        for await (const delta of stream) {
          if (assistantMessage.content.length === 0) {
            assistantMessage.content.push({ type: 'text', text: delta.delta });
          } else {
            assistantMessage.content[0].text += delta.delta;
          }

          setMessages(structuredClone(messages));
        }
      } catch (error) {
        console.error(error);
      }
    },
    [],
  );

  return {
    messages,
    submitMessage,
  };
}

export const inDevelopment_useConversation = useConversation;
