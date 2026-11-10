import { tencent, type TencentVideoModelOptions } from '@ai-sdk/tencent';
import { experimental_generateVideo as generateVideo } from 'ai';
import { presentVideos } from '../../lib/present-video';
import { run } from '../../lib/run';
import { withSpinner } from '../../lib/spinner';

run(async () => {
  // The character comes from the image; the motion comes from the reference
  // video, which must show a single person. Output length follows the video.
  const { videos } = await withSpinner(
    'Generating TokenHub Kling motion control video...',
    () =>
      generateVideo({
        model: tencent.video('kling-video-motion-control-v3.0'),
        prompt: {
          image:
            'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260408/sjuytr/wan-r2v-object-girl.jpg',
          text: 'The woman stands on a sunny city street.',
        },
        inputReferences: [
          {
            data: 'https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20260129/qigswt/wan-r2v-role2.mp4',
            mediaType: 'video/mp4',
          },
        ],
        generateAudio: false,
        providerOptions: {
          tencent: {
            characterOrientation: 'video',
            resolution: '720p',
          } satisfies TencentVideoModelOptions,
        },
        poll: { timeoutMs: 900000 },
      }),
  );

  await presentVideos(videos);
});
