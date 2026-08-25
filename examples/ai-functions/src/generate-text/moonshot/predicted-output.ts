import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

const existingCode = `
export function greet(name: string) {
  return 'Hello, ' + name;
}
`;

run(async () => {
  const result = await generateText({
    model: moonshotai('kimi-k3'),
    prompt:
      'Update the function to use a template literal. Respond only with code.',
    providerOptions: {
      moonshotai: {
        prediction: {
          type: 'content',
          content: existingCode,
        },
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  console.log(result.text);
});
