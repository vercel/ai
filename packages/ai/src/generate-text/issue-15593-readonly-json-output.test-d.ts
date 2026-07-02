import type { LanguageModel } from '../types/language-model';
import { generateText } from './generate-text';

const execute = () => [] as const;
declare const model: LanguageModel;

generateText({
  model,
  messages: [
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'readonlyArrayTool',
          output: {
            type: 'json',
            value: execute(),
          },
        },
      ],
    },
  ],
});
