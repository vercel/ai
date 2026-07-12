import { byteDance, type ByteDanceImageModelOptions } from '@ai-sdk/bytedance';
import { generateImage } from 'ai';
import { presentImages } from '../../lib/present-image';
import { run } from '../../lib/run';

run(async () => {
  const prompt =
    'Combine the style of image 1 with the subject of image 2 in a creative composition';
  console.log(`PROMPT: ${prompt}`);

  const result = await generateImage({
    model: byteDance.imageModel('seedream-5-0-260128'),
    prompt: {
      text: prompt,
      images: [
        'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
        'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/1200px-Cat_November_2010-1a.jpg',
      ],
    },
    providerOptions: {
      bytedance: {
        watermark: false,
      } satisfies ByteDanceImageModelOptions,
    },
  });

  await presentImages(result.images);

  console.log('Generated', result.images.length, 'image(s)');
  console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
  console.log(
    'Provider metadata:',
    JSON.stringify(result.providerMetadata, null, 2),
  );
});
