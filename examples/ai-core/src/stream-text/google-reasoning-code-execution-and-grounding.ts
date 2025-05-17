import { google, GoogleGenerativeAIProviderMetadata } from '@ai-sdk/google';
import { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
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
      } as GoogleGenerativeAIProviderOptions,
    },
    temperature: 0, // Use temp 0 for this to make the model make better use of search grounding
    onError(error) {
      console.error(error);
    },
    prompt:
      'Calculate 20th fibonacci number. Then find the nearest palindrome to it. Also, provide the current XMR to USD rate.',
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'file': {
        if (delta.type === 'file') {
          console.log(
            '\x1b[33m' +
              delta.type +
              '\x1b[34m: ' +
              delta.file.mediaType +
              '\x1b[0m',
          );
          console.log(atob(delta.file.base64 as string));
          console.log('\x1b[31m' + delta.type + '\x1b[0m');
        }
        break;
      }
      case 'text': {
        if (delta.type === 'text') {
          console.log(delta.text);
        }
        break;
      }
      case 'source': {
        if (delta.type === 'source' && delta.sourceType === 'url') {
          console.log('ID:', delta.id);
          console.log('Title:', delta.title);
          console.log('URL:', delta.url);
          console.log();
        }
        break;
      }
      case 'reasoning': {
        if (delta.type === 'reasoning') {
          console.log('\x1b[34m' + delta.type);
          console.log(delta.text);
          console.log('\x1b[0m');
        }
        break;
      }
      case 'tool-call': {
        if (delta.type === 'tool-call') {
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
        break;
      }
      case 'tool-result': {
        if (delta.type === 'tool-result') {
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
        break;
      }
      case 'error': {
        if (delta.type === 'error' && delta.error != null) {
          console.log(delta.error);
        }
        break;
      }
    }
  }
  console.log();

  // Show sources
  const providerMetadata = await result.providerMetadata;
  if (
    providerMetadata != null &&
    typeof providerMetadata === 'object' &&
    'google' in providerMetadata &&
    providerMetadata.google != null
  ) {
    const metadata =
      providerMetadata.google as unknown as GoogleGenerativeAIProviderMetadata;
    if (metadata != null) {
      console.log('\x1b[35m' + 'sources' + '\x1b[0m');
      if (metadata?.groundingMetadata?.webSearchQueries) {
        console.log('\x1b[36m' + 'Web Queries:' + '\x1b[0m');
        for (const query of metadata?.groundingMetadata?.webSearchQueries) {
          console.log(query);
        }
      }
      if (metadata.groundingMetadata?.searchEntryPoint != null) {
        console.log('\x1b[36m' + 'Search Entry Point: ' + '\x1b[0m');
        console.log(
          JSON.stringify(metadata.groundingMetadata?.searchEntryPoint, null, 2),
        );
      }
    }
  }
  console.log();
  console.log('Warnings:', await result.warnings);

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);
