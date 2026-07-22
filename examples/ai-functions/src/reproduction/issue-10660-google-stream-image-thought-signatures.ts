import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { type ModelMessage, streamText } from 'ai';
import 'dotenv/config';

type FetchObservation = {
  requestBody: string | undefined;
  responseBody: Promise<string>;
  status: number;
};

function sanitizeFixture(raw: string): string {
  return raw
    .split('\n')
    .map(line => {
      if (!line.startsWith('data: ')) {
        return line;
      }

      const value = JSON.parse(line.slice('data: '.length));

      for (const candidate of value.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.inlineData?.data != null) {
            part.inlineData.data = 'AA==';
          }
          if (part.thoughtSignature != null) {
            part.thoughtSignature = 'live-image-thought-signature';
          }
        }
      }

      if (value.responseId != null) {
        value.responseId = 'live-response-id';
      }

      return `data: ${JSON.stringify(value)}`;
    })
    .join('\n');
}

function hasSignedImage(raw: string): boolean {
  return raw.split('\n').some(line => {
    if (!line.startsWith('data: ')) {
      return false;
    }

    const value = JSON.parse(line.slice('data: '.length));
    return (value.candidates ?? []).some((candidate: any) =>
      (candidate.content?.parts ?? []).some(
        (part: any) =>
          part.inlineData != null &&
          typeof part.thoughtSignature === 'string' &&
          part.thoughtSignature.length > 0,
      ),
    );
  });
}

function historyHasSignedImage(messages: ModelMessage[]): boolean {
  return messages.some(
    message =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        part =>
          part.type === 'file' &&
          typeof part.providerOptions?.google?.thoughtSignature === 'string',
      ),
  );
}

function errorDescription(error: unknown): string | undefined {
  if (error == null) {
    return undefined;
  }
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : JSON.stringify(error);
}

async function runRefinement({
  messages,
  model,
}: {
  messages: ModelMessage[];
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
}) {
  const result = streamText({
    model,
    messages,
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
  });

  let error: unknown;
  let imageCount = 0;

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'file') {
        imageCount++;
      } else if (part.type === 'error') {
        error = part.error;
      }
    }
  } catch (caughtError) {
    error = caughtError;
  }

  return { error, imageCount };
}

async function main() {
  const observations: FetchObservation[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    observations.push({
      requestBody:
        typeof init?.body === 'string' ? init.body : init?.body?.toString(),
      responseBody: response.clone().text(),
      status: response.status,
    });
    return response;
  };

  const google = createGoogleGenerativeAI({ fetch: recordingFetch });
  const model = google('gemini-3-pro-image-preview');
  const firstUserMessage: ModelMessage = {
    role: 'user',
    content: 'Create an image of the moon.',
  };

  const firstResult = streamText({
    model,
    messages: [firstUserMessage],
    providerOptions: {
      google: { responseModalities: ['TEXT', 'IMAGE'] },
    },
  });
  const firstResponse = await firstResult.response;
  const firstRawResponse = await observations[0].responseBody;

  const fixturePath = resolve(
    process.cwd(),
    '../../packages/google/src/__fixtures__/issue-10660-image-thought-signature.chunks.txt',
  );
  await mkdir(resolve(fixturePath, '..'), { recursive: true });
  await writeFile(fixturePath, sanitizeFixture(firstRawResponse));

  const firstImageCount = firstResponse.messages
    .filter(message => message.role === 'assistant')
    .flatMap(message => (Array.isArray(message.content) ? message.content : []))
    .filter(part => part.type === 'file').length;
  const providerReturnedSignedImage = hasSignedImage(firstRawResponse);
  const sdkHistoryHasSignedImage = historyHasSignedImage(
    firstResponse.messages,
  );

  assert.ok(
    firstImageCount > 0,
    'The first streaming request returned no image.',
  );
  assert.ok(
    providerReturnedSignedImage,
    'The live provider response did not sign the image part.',
  );

  const messages: ModelMessage[] = [
    firstUserMessage,
    ...firstResponse.messages,
    { role: 'user', content: 'Nice, but now make it cheese.' },
  ];
  const directRefinement = await runRefinement({ messages, model });

  // release-v5 only accepts PNG assistant images, while the live model returns
  // JPEG. Relabel the same generated bytes so the narrowing request reaches
  // Google and isolates the missing thought signature reported by the issue.
  const narrowedMessages = structuredClone(messages);
  for (const message of narrowedMessages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'file') {
        part.mediaType = 'image/png';
      }
    }
  }
  const narrowedRefinement = await runRefinement({
    messages: narrowedMessages,
    model,
  });

  const secondRequest = observations.at(-1);
  const secondRequestHasThoughtSignature =
    secondRequest?.requestBody?.includes('thoughtSignature') ?? false;

  console.log(
    JSON.stringify(
      {
        firstImageCount,
        providerReturnedSignedImage,
        sdkHistoryHasSignedImage,
        directRefinement: {
          imageCount: directRefinement.imageCount,
          error: errorDescription(directRefinement.error),
        },
        narrowedRefinement: {
          imageCount: narrowedRefinement.imageCount,
          error: errorDescription(narrowedRefinement.error),
        },
        secondRequestHasThoughtSignature,
        responseStatuses: observations.map(observation => observation.status),
        fixturePath,
      },
      null,
      2,
    ),
  );

  assert.equal(sdkHistoryHasSignedImage, false);
  assert.equal(secondRequestHasThoughtSignature, false);
  assert.match(
    errorDescription(directRefinement.error) ?? '',
    /Only PNG images are supported in assistant messages/,
  );
  assert.equal(
    narrowedRefinement.error,
    undefined,
    'The narrowed follow-up streaming image refinement failed.',
  );
  assert.ok(
    narrowedRefinement.imageCount > 0,
    'The narrowed follow-up streaming image refinement returned no image.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
