import {
  LanguageModelV1ImagePart,
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1TextPart,
} from '../language-model';
import { convertDataContentToUint8Array } from './data-content';
import { Prompt } from './prompt';

export function convertToLanguageModelPrompt({
  system,
  prompt,
  messages,
}: Prompt): LanguageModelV1Prompt {
  if (prompt == null && messages == null) {
    throw new Error('prompt or messages must be defined');
  }

  if (prompt != null && messages != null) {
    throw new Error('prompt and messages cannot be defined at the same time');
  }

  const languageModelMessages: LanguageModelV1Prompt = [];

  if (system != null) {
    languageModelMessages.push({ role: 'system', content: system });
  }

  if (typeof prompt === 'string') {
    languageModelMessages.push({
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });
  } else {
    messages = messages!; // it's not null because of the check above

    languageModelMessages.push(
      ...messages.map((message): LanguageModelV1Message => {
        switch (message.role) {
          case 'user': {
            if (typeof message.content === 'string') {
              return {
                role: 'user',
                content: [{ type: 'text', text: message.content }],
              };
            }

            return {
              role: 'user',
              content: message.content.map(
                (part): LanguageModelV1TextPart | LanguageModelV1ImagePart => {
                  switch (part.type) {
                    case 'text': {
                      return part;
                    }

                    case 'image': {
                      return {
                        type: 'image',
                        image: convertDataContentToUint8Array(part.image),
                        mimeType: part.mimeType,
                      };
                    }
                  }
                },
              ),
            };
          }

          case 'assistant': {
            if (typeof message.content === 'string') {
              return {
                role: 'assistant',
                content: [{ type: 'text', text: message.content }],
              };
            }

            return { role: 'assistant', content: message.content };
          }

          case 'tool': {
            return message;
          }
        }
      }),
    );
  }

  return languageModelMessages;
}
