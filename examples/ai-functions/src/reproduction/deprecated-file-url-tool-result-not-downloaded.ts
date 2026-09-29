// Deterministic public-API reproduction; no live provider calls.
//
// A tool result that carries a remote file through the deprecated `file-url`
// and `image-url` content types is never passed to the download step, so when
// the model does not support URLs it receives the bare URL instead of the file
// bytes. The documented replacement for both types is a `file` part with
// `{ type: 'url' }`, and that shape is downloaded and inlined.
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const documentUrl = 'https://example.com/deprecated-file.pdf';
const imageUrl = 'https://example.com/deprecated-image.png';
const documentBytes = Buffer.from('%PDF-1.7 fake document', 'utf-8');
const imageBytes = Buffer.from('\x89PNG\r\n\x1a\n fake image', 'binary');

// Only these specific symptoms count as reproducing the reported bug.
// Transport failures and unrelated assertion failures are harness errors.
class ReproducedBugError extends Error {}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

const model = new MockLanguageModelV4({
  doGenerate: async ({ prompt }: LanguageModelV4CallOptions): Promise<any> => {
    const lastMessage = prompt[prompt.length - 1]!;
    const content = Array.isArray(lastMessage.content)
      ? lastMessage.content
      : [];

    // Collect every file part, whether the SDK hoisted it next to the tool
    // result or left it inside the tool result's content.
    const fileParts: any[] = [];
    for (const part of content) {
      if (part.type === 'file') {
        fileParts.push(part);
      } else if (
        part.type === 'tool-result' &&
        part.output?.type === 'content' &&
        Array.isArray(part.output.value)
      ) {
        fileParts.push(
          ...part.output.value.filter((entry: any) => entry.type === 'file'),
        );
      }
    }

    // A downloaded file reaches the model as inline data; a URL that was never
    // downloaded reaches it as a URL reference.
    const remoteParts = fileParts.filter(part => part.data?.type === 'url');
    if (remoteParts.length > 0) {
      throw new ReproducedBugError(
        `the model received ${remoteParts.length} URL reference(s) instead of the file bytes: ${remoteParts
          .map(part => String(part.data.url))
          .join(', ')}`,
      );
    }
    if (fileParts.length !== 2) {
      throw new Error(
        `HARNESS: expected 2 file parts, saw ${fileParts.length}; content was ${JSON.stringify(
          content,
          null,
          2,
        )}`,
      );
    }
    const inline = fileParts.every(part => part.data?.type === 'data');
    if (!inline) {
      throw new ReproducedBugError(
        `expected both files inlined, got ${JSON.stringify(
          fileParts.map(part => part.data?.type),
        )}`,
      );
    }

    return {
      content: [{ type: 'text', text: 'done' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    };
  },
});

async function main() {
  // Stand in for the network with the public `download` seam, so the run is
  // deterministic. The SDK hands it every URL it decided to fetch.
  const requestedUrls: string[] = [];
  const download = async (files: { url: URL }[]) => {
    return files.map(({ url }) => {
      requestedUrls.push(url.toString());
      if (url.toString() === documentUrl) {
        return {
          data: new Uint8Array(documentBytes),
          mediaType: 'application/pdf',
        };
      }
      if (url.toString() === imageUrl) {
        return { data: new Uint8Array(imageBytes), mediaType: 'image/png' };
      }
      throw new Error(`unexpected request: ${url}`);
    });
  };

  try {
    await generateText({
      model,
      experimental_download: download,
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'fetchAssets',
              input: {},
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'fetchAssets',
              output: {
                type: 'content',
                value: [
                  {
                    type: 'file-url',
                    url: documentUrl,
                    mediaType: 'application/pdf',
                  },
                  { type: 'image-url', url: imageUrl },
                ],
              },
            },
          ],
        },
      ],
    });
    console.log(
      'The deprecated file-url / image-url tool results were downloaded and inlined.',
    );
  } catch (error) {
    if (error instanceof ReproducedBugError) {
      console.error(
        'DEPRECATED_URL_TOOL_RESULTS_ARE_NOT_DOWNLOADED\n' +
          `- ${error.message}`,
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    // nothing to restore: the seam is passed per call
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
