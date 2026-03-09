import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const step1 = await generateText({
    model: google('gemini-3-pro-image-preview'),
    prompt: 'Generate a cartoon of a soccer stadium on the moon.',
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
        thinkingConfig: {
          includeThoughts: true,
        },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  console.log('=== STEP 1 ===');
  console.log('Reasoning:', step1.reasoning ?? '(none)');
  console.log('Text:', step1.text);

  const fileParts1 = step1.content.filter(part => part.type === 'file');
  const thoughtFiles1 = fileParts1.filter(
    p => p.providerMetadata?.google?.thought === true,
  );
  const outputFiles1 = fileParts1
    .filter(p => p.providerMetadata?.google?.thought !== true)
    .map(p => p.file);
  console.log(
    'Reasoning images:',
    thoughtFiles1.length > 0 ? thoughtFiles1.length : 'none',
  );
  await presentImages(outputFiles1);

  const step2 = await generateText({
    model: google('gemini-3-pro-image-preview'),
    messages: [
      ...step1.response.messages,
      {
        role: 'user',
        content: "Change it so that it's on Saturn.",
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ['TEXT', 'IMAGE'],
        thinkingConfig: {
          includeThoughts: true,
        },
      } satisfies GoogleLanguageModelOptions,
    },
  });

  console.log('=== STEP 2 ===');
  console.log('Reasoning:', step2.reasoning ?? '(none)');
  console.log('Text:', step2.text);

  const fileParts2 = step2.content.filter(part => part.type === 'file');
  const thoughtFiles2 = fileParts2.filter(
    p => p.providerMetadata?.google?.thought === true,
  );
  const outputFiles2 = fileParts2
    .filter(p => p.providerMetadata?.google?.thought !== true)
    .map(p => p.file);
  console.log(
    'Reasoning images:',
    thoughtFiles2.length > 0 ? thoughtFiles2.length : 'none',
  );
  await presentImages(outputFiles2);
});
