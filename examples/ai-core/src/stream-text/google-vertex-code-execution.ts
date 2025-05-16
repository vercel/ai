import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: vertex('gemini-2.5-flash-preview-04-17'),
    providerOptions: {
      google: {
        useCodeExecution: true,
      },
    },
    maxOutputTokens: 10000,
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it.',
  });

  let fullResponse = '';

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'file': {
        if (delta.type === 'file') {
          process.stdout.write(
            '\x1b[33m' +
              delta.type +
              '\x1b[34m: ' +
              delta.file.mediaType +
              '\x1b[0m',
          );
          console.log();
          console.log(atob(delta.file.base64 as string));
        }
      }
      case 'text': {
        if (delta.type === 'text') {
          process.stdout.write('\x1b[34m' + delta.type + '\x1b[0m');
          console.log();
          console.log(delta.text);
          fullResponse += delta.text;
        }
        break;
      }
    }
  }
  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.log);
