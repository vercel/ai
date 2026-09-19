import { createDeepSeek } from '@ai-sdk/deepseek';
import sharp from 'sharp';

const expectedCode = 'ORBIT 7319';
const expectedFrameColor = 'cyan';
const failureSignal =
  'Issue #21174 reproduced: @ai-sdk/deepseek could not read an image returned in a tool result';

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

function readsImage(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes(expectedCode.toLowerCase()) &&
    normalized.includes(expectedFrameColor)
  );
}

async function createScreenshot(): Promise<Buffer> {
  const svg = `<svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
    <rect width="640" height="360" fill="#00ffff"/>
    <rect x="40" y="40" width="560" height="280" rx="20" fill="#111827"/>
    <text x="320" y="155" font-family="Arial, sans-serif" font-size="62" font-weight="bold" text-anchor="middle" fill="#ffffff">${expectedCode}</text>
    <text x="320" y="235" font-family="Arial, sans-serif" font-size="42" text-anchor="middle" fill="#facc15">CYAN FRAME</text>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function callDeepSeekDirectly(
  dataUrl: string,
): Promise<DeepSeekResponse> {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      messages: [
        {
          role: 'user',
          content:
            'Use the inspect_image tool result, then state the exact large white code and the frame color. Do not guess.',
        },
        {
          role: 'assistant',
          content: '',
          reasoning_content: '',
          tool_calls: [
            {
              id: 'call_repro_21174',
              type: 'function',
              function: { name: 'inspect_image', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_repro_21174',
          content: [
            {
              type: 'text',
              text: 'Screenshot captured. Read the exact text and colors.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'inspect_image',
            description: 'Returns a screenshot.',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      max_tokens: 256,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Direct DeepSeek request failed with HTTP ${response.status}: ${responseText}`,
    );
  }

  return JSON.parse(responseText) as DeepSeekResponse;
}

async function main(): Promise<void> {
  const screenshot = await createScreenshot();
  const dataUrl = `data:image/png;base64,${screenshot.toString('base64')}`;

  const directResponse = await callDeepSeekDirectly(dataUrl);
  const directText = directResponse.choices?.[0]?.message?.content ?? '';

  if (!readsImage(directText)) {
    throw new Error(
      `Direct DeepSeek tool-result image check did not return the expected code and color: ${directText}`,
    );
  }

  const deepseek = createDeepSeek();
  const sdkResult = await deepseek('deepseek-flash').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Use the inspect_image tool result, then state the exact large white code and the frame color. Do not guess.',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'reasoning', text: '' },
          {
            type: 'tool-call',
            toolCallId: 'call_repro_21174',
            toolName: 'inspect_image',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_repro_21174',
            toolName: 'inspect_image',
            output: {
              type: 'content',
              value: [
                {
                  type: 'text',
                  text: 'Screenshot captured. Read the exact text and colors.',
                },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: screenshot },
                },
              ],
            },
          },
        ],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'inspect_image',
        description: 'Returns a screenshot.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    maxOutputTokens: 256,
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
        reasoningEffort: 'max',
      },
    },
  });

  const sdkText = sdkResult.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('');

  if (!readsImage(sdkText)) {
    const requestBody = sdkResult.request?.body as
      | {
          messages: Array<{ role: string; content: unknown }>;
        }
      | undefined;
    const toolMessage = requestBody?.messages.find(
      message => message.role === 'tool',
    );

    console.error(
      JSON.stringify(
        {
          direct: {
            text: directText,
            promptTokens: directResponse.usage?.prompt_tokens,
          },
          aiSdk: {
            text: sdkText,
            reasoning: sdkResult.content
              .filter(part => part.type === 'reasoning')
              .map(part => part.text)
              .join(''),
            inputTokens: sdkResult.usage.inputTokens.total,
            toolContentType: typeof toolMessage?.content,
          },
        },
        null,
        2,
      ),
    );
    throw new Error(failureSignal);
  }

  console.log(
    `DeepSeek read ${expectedCode} and the ${expectedFrameColor} frame from the AI SDK tool result.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
