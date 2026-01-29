import { fal } from '@ai-sdk/fal';
import { experimental_generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';
import fs from 'node:fs';

run(async () => {
  // Example: Load an image file for image-to-video generation
  // Replace with your own image path
  const imagePath = './path/to/your/image.jpg';

  // Check if image exists
  if (!fs.existsSync(imagePath)) {
    console.log(
      'Note: Update the imagePath variable with a valid image file path',
    );
    console.log('Falling back to text-to-video generation...\n');

    const { video } = await withSpinner('Generating video...', () =>
      experimental_generateVideo({
        model: fal.video('luma-dream-machine'),
        prompt: 'A bird flying over a mountain range at sunrise',
        aspectRatio: '16:9',
        duration: 5,
      }),
    );

    await presentVideos([video]);
    return;
  }

  const imageBuffer = fs.readFileSync(imagePath);

  const { video } = await experimental_generateVideo({
    model: fal.video('luma-dream-machine'),
    prompt: {
      files: [imageBuffer],
      text: 'Animate this image with gentle camera movement',
    },
    aspectRatio: '16:9',
    duration: 5,
  });

  await presentVideos([video]);
});
