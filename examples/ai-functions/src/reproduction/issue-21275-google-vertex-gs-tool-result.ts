import { createVertex } from '@ai-sdk/google-vertex';
import { DownloadError, generateText } from 'ai';

const gsUrl = 'gs://example-bucket/renditions/hero.png';
const failureSignal =
  'ISSUE_21275_REPRODUCED: gs:// tool-result file was not forwarded as functionResponse.parts[].fileData.';

type RequestBody = {
  contents?: Array<{
    role?: string;
    parts?: Array<{
      fileData?: { fileUri?: string; mimeType?: string };
      functionResponse?: {
        parts?: Array<{
          fileData?: { fileUri?: string; mimeType?: string };
        }>;
      };
    }>;
  }>;
};

function hasExpectedFileData(
  parts:
    | Array<{
        fileData?: { fileUri?: string; mimeType?: string };
      }>
    | undefined,
) {
  return (
    parts?.some(
      part =>
        part.fileData?.fileUri === gsUrl &&
        part.fileData.mimeType === 'image/png',
    ) === true
  );
}

async function main() {
  const requests: RequestBody[] = [];

  const vertex = createVertex({
    apiKey: 'fake-api-key',
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected a JSON request body.');
      }

      requests.push(JSON.parse(init.body) as RequestBody);

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'ok' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  await generateText({
    model: vertex('gemini-3.8-flash'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe the hero image.' },
          {
            type: 'file',
            data: new URL(gsUrl),
            mediaType: 'image/png',
          },
        ],
      },
    ],
  });

  const userMessage = requests[0]?.contents?.at(-1);
  if (!hasExpectedFileData(userMessage?.parts)) {
    throw new Error(
      'Control failed: the user-message gs:// file was not forwarded as fileData.',
    );
  }

  try {
    await generateText({
      model: vertex('gemini-3.8-flash'),
      messages: [
        {
          role: 'user',
          content: 'Look at the hero image and describe it.',
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_1',
              toolName: 'view_files',
              input: { media_ids: ['m1'] },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_1',
              toolName: 'view_files',
              output: {
                type: 'content',
                value: [
                  { type: 'text', text: 'hero.png activated' },
                  {
                    type: 'file-url',
                    url: gsUrl,
                    mediaType: 'image/png',
                  } as any,
                ],
              },
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (
      DownloadError.isInstance(error) &&
      error.url === gsUrl &&
      error.message.includes('URL scheme must be http, https, or data, got gs:')
    ) {
      console.log(
        JSON.stringify(
          {
            userMessageForwardedAsFileData: true,
            toolResultRequestDispatched: requests.length > 1,
            errorName: error.name,
            errorMessage: error.message,
          },
          null,
          2,
        ),
      );
      throw new Error(failureSignal);
    }

    throw error;
  }

  const toolMessage = requests[1]?.contents?.find(content =>
    content.parts?.some(part => part.functionResponse != null),
  );
  const functionResponse = toolMessage?.parts?.find(
    part => part.functionResponse != null,
  )?.functionResponse;

  if (!hasExpectedFileData(functionResponse?.parts)) {
    console.log(
      JSON.stringify(
        {
          userMessageForwardedAsFileData: true,
          toolResultRequestDispatched: true,
          observedFunctionResponse: functionResponse,
        },
        null,
        2,
      ),
    );
    throw new Error(failureSignal);
  }

  console.log(
    JSON.stringify(
      {
        userMessageForwardedAsFileData: true,
        toolResultForwardedAsFunctionResponseFileData: true,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
