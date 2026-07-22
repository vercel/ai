import { createGoogle, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText, type ModelMessage } from 'ai';

type GooglePart = {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  thoughtSignature?: string;
};

type GoogleRequest = {
  contents?: Array<{
    role?: string;
    parts?: GooglePart[];
  }>;
};

const providerOptions = {
  google: {
    responseModalities: ['TEXT', 'IMAGE'],
  } satisfies GoogleLanguageModelOptions,
};

async function main() {
  const requests: GoogleRequest[] = [];
  const google = createGoogle({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requests.push(JSON.parse(init.body) as GoogleRequest);
      }
      return fetch(input, init);
    },
  });
  const model = google('gemini-3-pro-image-preview');
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: 'Create an image of the moon.',
    },
  ];

  const turn1 = streamText({
    model,
    messages,
    providerOptions,
  });

  const turn1ImageSignatures: string[] = [];
  let turn1ImageCount = 0;

  for await (const part of turn1.fullStream) {
    if (part.type === 'file' && part.file.mediaType.startsWith('image/')) {
      turn1ImageCount++;
      const signature = part.providerMetadata?.google?.thoughtSignature;
      if (typeof signature === 'string') {
        turn1ImageSignatures.push(signature);
      }
    }
  }

  messages.push(...(await turn1.response).messages);
  messages.push({
    role: 'user',
    content: 'Nice, but now make it cheese.',
  });

  const turn2 = streamText({
    model,
    messages,
    providerOptions,
  });

  let turn2ImageCount = 0;
  for await (const part of turn2.fullStream) {
    if (part.type === 'file' && part.file.mediaType.startsWith('image/')) {
      turn2ImageCount++;
    }
  }

  const historyImageParts =
    requests[1]?.contents
      ?.filter(content => content.role === 'model')
      .flatMap(content => content.parts ?? [])
      .filter(
        part =>
          part.inlineData?.mimeType?.startsWith('image/') === true &&
          typeof part.thoughtSignature === 'string',
      ) ?? [];

  console.log(
    JSON.stringify(
      {
        model: 'gemini-3-pro-image-preview',
        requestCount: requests.length,
        turn1ImageCount,
        turn1SignedImageCount: turn1ImageSignatures.length,
        signedHistoryImageCount: historyImageParts.length,
        turn2ImageCount,
      },
      null,
      2,
    ),
  );

  if (turn1ImageCount === 0) {
    throw new Error('Turn 1 did not return an image.');
  }

  if (turn1ImageSignatures.length !== turn1ImageCount) {
    throw new Error(
      'Reproduced issue #10660: streamed image output is missing a thought signature.',
    );
  }

  if (historyImageParts.length === 0) {
    throw new Error(
      'Reproduced issue #10660: the streamed image thought signature was not included in the follow-up request history.',
    );
  }

  if (turn2ImageCount === 0) {
    throw new Error(
      'Reproduced issue #10660: the follow-up streamed image refinement did not produce an image.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
