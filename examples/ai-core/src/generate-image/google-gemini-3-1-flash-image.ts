import { google, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { presentImages } from '../lib/present-image';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.1-flash-image-preview'),
    prompt: 'A nano banana in a fancy restaurant',
    providerOptions: {
      google: {
        imageConfig: {
          aspectRatio: '4:1',
        },
        thinkingConfig: {
          thinkingLevel: 'minimal',
        },
      } as GoogleGenerativeAIProviderOptions,
    },
  });

  for (const file of result.files) {
    if (file.mediaType.startsWith('image/')) {
        presentImages([file]);
    }
  }
});