import { gateway, experimental_generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  const { videos } = await withSpinner('Generating video...', () =>
    experimental_generateVideo({
      model: gateway.videoModel('bytedance/seedance-2.0'),
      prompt:
        'A boy wearing glasses and a blue T-shirt from [Image 1] and a corgi dog from [Image 2], sitting on the lawn from [Image 3], in 3D cartoon style.',
      aspectRatio: '16:9',
      duration: 5,
      resolution: '720p',
      providerOptions: {
        bytedance: {
          referenceImages: [
            'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seelite_ref_1.png',
            'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seelite_ref_2.png',
            'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/seelite_ref_3.png',
          ],
        },
      },
    }),
  );

  await presentVideos(videos);
});
