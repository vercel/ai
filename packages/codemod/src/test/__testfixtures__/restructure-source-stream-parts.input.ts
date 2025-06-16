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
        console.log('Source ID:', delta.source.id);
        console.log('Source URL:', delta.source.url);
        console.log('Source Type:', delta.source.sourceType);
        console.log('Source Title:', delta.source.title);
        
        if (delta.source.sourceType === 'url') {
          processUrlSource(delta.source.url, delta.source.title);
        } else if (delta.source.sourceType === 'document') {
          processDocumentSource(delta.source.mediaType, delta.source.filename);
        }
        
        // Provider metadata access
        if (delta.source.providerMetadata) {
          console.log('Provider metadata:', delta.source.providerMetadata);
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
