import {
  IdGenerator,
  ModelMessage,
  generateId as originalGenerateId,
} from '@ai-sdk/provider-utils';
import { UIDataTypes, UIMessage, UIMessagePart, UITools } from './ui-messages';

export function convertToUIMessages(
  modelMessages: ModelMessage[],
  {
    generateId = originalGenerateId,
  }: {
    generateId?: IdGenerator;
  } = {},
): UIMessage[] {
  const uiMessages: UIMessage[] = [];

  for (const modelMessage of modelMessages) {
    switch (modelMessage.role) {
      case 'user': {
        let parts: UIMessagePart<UIDataTypes, UITools>[];

        if (typeof modelMessage.content === 'string') {
          parts = [{ text: modelMessage.content, type: 'text' }];
        } else {
          parts = modelMessage.content.map(part => {
            switch (part.type) {
              case 'text':
                return { type: 'text', text: part.text };
              case 'file':
                return {
                  type: 'file',
                  url: part.data,
                  mediaType: part.mediaType,
                };
              case 'image':
                return {
                  type: 'file',
                  data: part.image,
                  mediaType: part.mediaType,
                };
            }
          });
        }

        uiMessages.push({ id: generateId(), role: 'user', parts });
        break;
      }
    }
  }

  return uiMessages;
}
