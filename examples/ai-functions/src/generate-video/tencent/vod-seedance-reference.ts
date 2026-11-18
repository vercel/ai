import { tencent, type TencentVideoModelOptions } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  // Reference images and videos are sent as VOD FileInfos with
  // Usage "Reference"; the category follows each reference's media type.
  const { videos } = await withSpinner(
    'Generating Seedance 2.0 reference-to-video through Tencent VOD...',
    () =>
      generateVideo({
        model: tencent.video('vod/VS/2.0'),
        prompt:
          'The cartoon cat pipes chocolate cream onto a sponge cake, ' +
          'using the same motion as the reference video.',
        inputReferences: [
          {
            data: fs.readFileSync('data/comic-cat.png'),
            mediaType: 'image/png',
          },
          {
            data: 'https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_video/r2v_tea_video1.mp4',
            mediaType: 'video/mp4',
          },
        ],
        aspectRatio: '16:9',
        duration: 4,
        resolution: '854x480',
        providerOptions: {
          tencent: {
            referenceVideoType: 'feature',
          } satisfies TencentVideoModelOptions,
        },
        poll: { timeoutMs: 900000 },
      }),
  );

  await presentVideos(videos);
});
