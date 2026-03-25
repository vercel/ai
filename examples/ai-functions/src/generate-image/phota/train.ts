import { phota } from '@ai-sdk/phota';
import { generateImage } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Step 1: Train a profile from reference images (returns immediately)
  const trainResult = await generateImage({
    model: phota.image('train'),
    prompt: {
      images: [
        'https://example.com/photo1.jpg',
        'https://example.com/photo2.jpg',
        'https://example.com/photo3.jpg',
        // Phota requires 30-100 publicly accessible image URLs
      ],
    },
  });

  const photaTrainMeta = trainResult.providerMetadata!.phota as {
    profileId: string;
  };
  const profileId = photaTrainMeta.profileId;
  console.log('Profile created:', profileId);

  // Step 2: Poll training status
  const statusResult = await generateImage({
    model: phota.image('status'),
    prompt: '',
    providerOptions: { phota: { profileId } },
  });

  const photaStatusMeta = statusResult.providerMetadata!.phota as {
    status: string;
  };
  const status = photaStatusMeta.status;
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
