import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, type ModelMessage } from 'ai';
import 'dotenv/config';
import sharp from 'sharp';

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
  };
};

const failureSignal =
  'DeepSeek tool-result image was not visible through AI SDK';

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey == null) {
    throw new Error('DEEPSEEK_API_KEY is required');
  }

  const code = `QZ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const image = await sharp(
    Buffer.from(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="360" fill="#07131f"/>
        <rect x="18" y="18" width="604" height="324" rx="18"
              fill="none" stroke="#00ffff" stroke-width="12"/>
        <text x="320" y="200" fill="#ffffff" font-size="72"
              font-family="monospace" font-weight="bold"
              text-anchor="middle">${code}</text>
      </svg>
    `),
  )
    .png()
    .toBuffer();
  const imageBase64 = image.toString('base64');
  const toolCallId = 'call_screenshot';
  const instruction =
    'A screenshot tool has returned an image. Reply with exactly the alphanumeric code visible in the screenshot, including the hyphen, and no other text.';

  const directResponse = await fetch(
    'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-flash',
        max_tokens: 64,
        thinking: { type: 'enabled' },
        reasoning_effort: 'max',
        messages: [
          { role: 'user', content: instruction },
          {
            role: 'assistant',
            content: '',
            reasoning_content:
              'I need to inspect the screenshot from the tool.',
            tool_calls: [
              {
                id: toolCallId,
                type: 'function',
                function: { name: 'take_screenshot', arguments: '{}' },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: toolCallId,
            content: [
              { type: 'text', text: 'Screenshot captured.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    },
  );
  const directBody = (await directResponse.json()) as DeepSeekResponse;
  if (!directResponse.ok) {
    throw new Error(
      `Direct DeepSeek request failed (${directResponse.status}): ${JSON.stringify(directBody)}`,
    );
  }

  const directText = directBody.choices?.[0]?.message?.content ?? '';
  if (normalize(directText) !== normalize(code)) {
    throw new Error(
      `Direct DeepSeek tool-image control did not read ${code}: ${JSON.stringify(directText)}`,
    );
  }

  let sdkRequestBody: unknown;
  const deepseek = createDeepSeek({
    apiKey,
    fetch: async (input, init) => {
      sdkRequestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      return fetch(input, init);
    },
  });
  const messages: ModelMessage[] = [
    { role: 'user', content: instruction },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'I need to inspect the screenshot from the tool.',
        },
        {
          type: 'tool-call',
          toolCallId,
          toolName: 'take_screenshot',
          input: {},
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId,
          toolName: 'take_screenshot',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'Screenshot captured.' },
              {
                type: 'image-data',
                mediaType: 'image/png',
                data: imageBase64,
              },
            ],
          },
        },
      ],
    },
  ];

  const sdkResult = await generateText({
    model: deepseek('deepseek-flash'),
    messages,
    maxOutputTokens: 64,
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
        reasoningEffort: 'max',
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        expectedCode: code,
        direct: {
          text: directText,
          promptTokens: directBody.usage?.prompt_tokens,
        },
        sdk: {
          text: sdkResult.text,
          promptTokens: sdkResult.usage.inputTokens,
          requestToolContent: summarizeToolContent(
            getToolContent(sdkRequestBody),
          ),
        },
      },
      null,
      2,
    ),
  );

  if (normalize(sdkResult.text) !== normalize(code)) {
    throw new Error(
      `${failureSignal}: expected ${code}, received ${JSON.stringify(sdkResult.text)}`,
    );
  }
}

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function getToolContent(requestBody: unknown) {
  if (
    typeof requestBody !== 'object' ||
    requestBody == null ||
    !('messages' in requestBody) ||
    !Array.isArray(requestBody.messages)
  ) {
    return undefined;
  }

  return requestBody.messages.find(
    (message: unknown) =>
      typeof message === 'object' &&
      message != null &&
      'role' in message &&
      message.role === 'tool',
  )?.content;
}

function summarizeToolContent(content: unknown) {
  if (typeof content !== 'string') {
    return content;
  }

  return {
    type: 'string',
    length: content.length,
    prefix: content.slice(0, 120),
  };
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
