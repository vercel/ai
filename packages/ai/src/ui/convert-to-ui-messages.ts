import {
  IdGenerator,
  ModelMessage,
  generateId as originalGenerateId,
} from '@ai-sdk/provider-utils';
import { UIMessage } from './ui-messages';

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
        if (typeof modelMessage.content === 'string') {
          uiMessages.push({
            id: generateId(),
            role: 'user',
            parts: [{ text: modelMessage.content, type: 'text' }],
          });
        }
        break;
      }
    }
  }

  return uiMessages;
}
