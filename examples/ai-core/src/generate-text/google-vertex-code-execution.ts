import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: vertex('gemini-2.5-pro-preview-05-06'),
    providerOptions: {
      google: {
        useCodeExecution: true,
      },
    },
    maxOutputTokens: 2048,
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it.',
  });

  for (const part of result.content) {
    switch (part.type) {
      case 'file': {
        if (part.type === 'file') {
          process.stdout.write(
            '\x1b[33m' +
              part.type +
              '\x1b[34m: ' +
              part.file.mediaType +
              '\x1b[0m',
          );
          console.log();
          console.log(atob(part.file.base64));
        }
      }
      case 'text': {
        if (part.type === 'text') {
          process.stdout.write('\x1b[34m' + part.type + '\x1b[0m');
          console.log();
          console.log(part.text);
        }
      }
    }
  }

  process.stdout.write('\n\n');

  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
