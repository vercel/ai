import {
  getPhotaStatusResult,
  getPhotaTrainResult,
  phota,
} from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Step 1: Train a profile from reference images (returns immediately)
  const trainResult = await generateImage({
    model: phota.image('train'),
    prompt: {
      images: Array.from(
        { length: 30 },
        (_, i) => `https://picsum.photos/id/${i + 10}/512/512`,
      ),
    },
  });

  const { profileId } = getPhotaTrainResult(trainResult.providerMetadata);
  console.log('Profile created:', profileId);

  // Step 2: Poll training status
  const statusResult = await generateImage({
    model: phota.image('status'),
    prompt: '',
    providerOptions: { phota: { profileId } },
  });

  const { status } = getPhotaStatusResult(statusResult.providerMetadata);
  console.log('Training status:', status);

  // Step 3: Once READY, generate images using the profile
  if (status === 'READY') {
    const { images } = await generateImage({
      model: phota.image('generate'),
      prompt: `A photo of [[${profileId}]] at a dinner party`,
    });

    console.log('Generated', images.length, 'image(s) with profile');
  }
});
