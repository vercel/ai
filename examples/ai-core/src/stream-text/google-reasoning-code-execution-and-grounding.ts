import { google, GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.5-flash-preview-04-17'),
    maxOutputTokens: 10000,
    providerOptions: {
      google: {
        // Only GoogleGenerativeAI Provider supports both grounding and code execution
        useCodeExecution: true,
        useSearchGrounding: true,
        // Flash Preview supports thinking
        thinkingConfig: {
          thinkingBudget: 2048,
        },
      },
    },
    onError(error) {
      console.error(error);
    },
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it. Also, provide the current XMR to USD rate, provide sources.',
  });

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
        }
      }
      case 'source': {
        if (delta.type === 'source' && delta.sourceType === 'url') {
          process.stdout.write('\x1b[32m' + delta.type + '\x1b[0m');
          console.log();
          console.log('ID:', delta.id);
          console.log('Title:', delta.title);
          console.log('URL:', delta.url);
          console.log();
        }
      }
      case 'reasoning': {
        if (delta.type === 'reasoning') {
          console.log('\x1b[34m' + delta.type);
          console.log();
          console.log(delta.text);
          console.log('\x1b[0m');
        }
      }
      case 'tool-call': {
        if (delta.type === 'tool-call') {
          console.log('\x1b[33m' + delta.type);
          console.log(
            'TOOL CALL: ',
            delta.toolName,
            '(',
            delta.toolCallId,
            ')',
          );
          console.log('Args: ', delta.args);
          console.log('\x1b[0m');
        }
      }
      case 'tool-result': {
        if (delta.type === 'tool-result') {
          console.log('\x1b[37m' + delta.type);
          console.log();
          console.log(
            'TOOL RESULT: ',
            delta.toolName,
            '(',
            delta.toolCallId,
            ')',
          );
          console.log(delta.result);
          console.log('\x1b[0m');
        }
      }
      case 'error': {
        console.log('\x1b[31m' + delta.type + '\x1b[0m');
        console.log();
        if (delta.type === 'error' && delta.error != null) {
          console.log(delta.error);
        }
      }
    }
  }

  // Show sources
  const metadata = (await result.providerMetadata) as
    | GoogleGenerativeAIProviderMetadata
    | undefined;
  if (metadata != null) {
    console.log('\x1b[31m' + 'sources' + '\x1b[0m');
    if (
      metadata?.groundingMetadata?.webSearchQueries &&
      metadata?.groundingMetadata?.webSearchQueries?.length > 0
    ) {
      console.log(
        'Web Queries: ',
        metadata?.groundingMetadata?.webSearchQueries,
      );
    }
    if (metadata.groundingMetadata?.searchEntryPoint != null) {
      console.log(
        'Search Entry Point: ',
        JSON.stringify(metadata.groundingMetadata?.searchEntryPoint, null, 2),
      );
    }
  }
  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
