import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

const FILE_URL = 'https://www.rfc-editor.org/rfc/rfc1149.txt';

type ObservedDownload = {
  url: string;
  isUrlSupportedByModel: boolean;
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

async function main() {
  const observedDownloads: ObservedDownload[] = [];
  const performedDownloads: string[] = [];
  const streamErrors: Array<{ name: string; message: string }> = [];
  const chunks: Array<{ type: string }> = [];

  const result = streamText({
    model: google('gemini-3.5-flash'),
    maxOutputTokens: 32,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: new URL(FILE_URL),
            mediaType: 'text/plain',
          },
          { type: 'text', text: 'Summarize this file in one sentence.' },
        ],
      },
    ],
    experimental_download: async downloads => {
      observedDownloads.push(
        ...downloads.map(download => ({
          url: download.url.toString(),
          isUrlSupportedByModel: download.isUrlSupportedByModel,
        })),
      );

      return Promise.all(
        downloads.map(async download => {
          if (download.isUrlSupportedByModel) {
            return null;
          }

          performedDownloads.push(download.url.toString());

          const response = await fetch(download.url);
          if (!response.ok) {
            throw new Error(
              `download failed: ${response.status} ${response.statusText}`,
            );
          }

          return {
            data: new Uint8Array(await response.arrayBuffer()),
            mediaType: response.headers.get('content-type') ?? undefined,
          };
        }),
      );
    },
    onChunk: ({ chunk }) => {
      chunks.push({ type: chunk.type });
    },
    onError: ({ error }) => {
      streamErrors.push(describeError(error));
    },
  });

  await result.consumeStream({
    onError: error => {
      streamErrors.push(describeError(error));
    },
  });

  let text: string | undefined;
  let finishReason: string | undefined;
  try {
    text = await result.text;
    finishReason = await result.finishReason;
  } catch (error) {
    streamErrors.push(describeError(error));
  }

  const externalTextPlainDownload = observedDownloads.find(
    download => download.url === FILE_URL,
  );

  console.log(
    JSON.stringify(
      {
        issue: 16751,
        model: 'google:gemini-3.5-flash',
        file: {
          url: FILE_URL,
          mediaType: 'text/plain',
        },
        observedDownloads,
        performedDownloads,
        reproduced:
          externalTextPlainDownload?.isUrlSupportedByModel === false &&
          performedDownloads.includes(FILE_URL),
        expected: {
          isUrlSupportedByModel: true,
          performedDownloads: [],
        },
        text,
        finishReason,
        chunks,
        streamErrors,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(JSON.stringify({ fatalError: describeError(error) }, null, 2));
  process.exitCode = 1;
});
