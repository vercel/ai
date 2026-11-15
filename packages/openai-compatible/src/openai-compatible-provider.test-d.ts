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
