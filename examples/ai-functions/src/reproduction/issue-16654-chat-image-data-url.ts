import { generateText } from 'ai';
import { OpenAIChatLanguageModel } from '@ai-sdk/openai/internal';

let requestBody: any;

const model = new OpenAIChatLanguageModel('any-model', {
  provider: 'test',
  url: () => 'https://example.invalid/chat/completions',
  headers: () => ({}),
  fetch: async (_url, init) => {
    requestBody = JSON.parse(init!.body as string);

    return new Response(
      JSON.stringify({
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  },
});

await generateText({
  model,
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'file',
          data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
          mediaType: 'image/jpeg',
        },
      ],
    },
  ],
});

const imageUrl = requestBody.messages[0].content.find(
  (content: any) => content.type === 'image_url',
).image_url.url;

console.log(`OpenAI chat image_url.url: ${imageUrl}`);

const expected = 'data:image/jpeg;base64,/9j/4A==';

if (imageUrl !== expected) {
  throw new Error(
    `Issue #16654 reproduced: expected ${JSON.stringify(
      expected,
    )}, got ${JSON.stringify(imageUrl)}`,
  );
}
