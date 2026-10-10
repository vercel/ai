import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { createOpenAICompatible } from './index';

const provider = createOpenAICompatible({
  name: 'video-provider',
  baseURL: 'https://api.example.com/v1',
  supportedUrls: () => ({
    'video/*': [/^https:\/\/example\.com\//],
  }),
});

const videoPrompt = {
  prompt: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'video/mp4',
          data: {
            type: 'url',
            url: new URL('https://example.com/video.mp4'),
          },
        },
      ],
    },
  ],
} satisfies LanguageModelV4CallOptions;

provider('video-model').doGenerate(videoPrompt);

const createdVideo = provider.videos.create({
  model: 'video-model',
  prompt: 'A city at sunset',
});

provider.videos.create({ prompt: 'A city at sunset' }).then(video => video.id);

createdVideo.then(video => {
  const id: string = video.id;
  const status: string = video.status;
  const providerError: unknown = video.error;
  return provider.videos.retrieve(id).then(result => {
    const resultStatus: string = result.status;
    return [status, providerError, resultStatus];
  });
});
