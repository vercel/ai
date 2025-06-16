// @ts-nocheck
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function example() {
  const result = await streamText({
    model: openai('gpt-4'),
    prompt: 'Hello',
  });

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'source': {
        console.log('Source ID:', delta.id);
        console.log('Source URL:', delta.url);
        console.log('Source Type:', delta.sourceType);
        console.log('Source Title:', delta.title);
        
        if (delta.sourceType === 'url') {
          processUrlSource(delta.url, delta.title);
        } else if (delta.sourceType === 'document') {
          processDocumentSource(delta.mediaType, delta.filename);
        }
        
        // Provider metadata access
        if (delta.providerMetadata) {
          console.log('Provider metadata:', delta.providerMetadata);
        }
        break;
      }
      case 'text': {
        console.log('Text:', delta.text);
        break;
      }
    }
  }
}
