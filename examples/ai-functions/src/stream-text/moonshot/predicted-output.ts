import {
  moonshotai,
  type MoonshotAILanguageModelOptions,
} from '@ai-sdk/moonshotai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

const source = `export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
`;

run(async () => {
  const result = streamText({
    model: moonshotai('kimi-k3'),
    messages: [
      {
        role: 'user',
        content:
          'Change the function to say "Welcome" instead of "Hello". Respond only with the updated code.',
      },
      { role: 'user', content: source },
    ],
    providerOptions: {
      moonshotai: {
        prediction: {
          type: 'content',
          content: source,
        },
      } satisfies MoonshotAILanguageModelOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
