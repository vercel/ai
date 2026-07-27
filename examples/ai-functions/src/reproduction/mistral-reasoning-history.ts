import { createMistral } from '@ai-sdk/mistral';
import { generateText, type ModelMessage } from 'ai';

type MistralContentChunk =
  | {
      type: 'thinking';
      thinking: Array<{ type: 'text'; text: string }>;
      closed: boolean;
    }
  | { type: 'text'; text: string };

type MistralResponse = {
  choices: Array<{
    message: {
      content: string | Array<MistralContentChunk>;
    };
  }>;
};

type MistralRequest = {
  model: string;
  messages: Array<{
    role: string;
    content: unknown;
  }>;
  reasoning_effort?: string;
};

const failureSignal =
  'BUG REPRODUCED: Mistral reasoning history was flattened into one plain string and the visible answer was appended to the reasoning text.';

async function main() {
  const requests: Array<MistralRequest> = [];
  const responses: Array<MistralResponse> = [];

  const recordingFetch: typeof fetch = async (input, init) => {
    const sdkBody =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as MistralRequest)
        : undefined;

    if (sdkBody != null) {
      requests.push(structuredClone(sdkBody));
    }

    // release-v5 parses ThinkChunk responses but predates the
    // reasoningEffort provider option. Inject the documented Mistral field so
    // the target provider receives the response shape whose replay is under
    // test.
    const response = await fetch(input, {
      ...init,
      body:
        sdkBody == null
          ? init?.body
          : JSON.stringify({ ...sdkBody, reasoning_effort: 'high' }),
    });

    responses.push((await response.clone().json()) as MistralResponse);
    return response;
  };

  const mistral = createMistral({
    apiKey: process.env.MISTRAL_API_KEY,
    fetch: recordingFetch,
  });
  const model = mistral('mistral-small-latest');

  const firstUserMessage: ModelMessage = {
    role: 'user',
    content: 'What is 17 * 23? Reply with only the result.',
  };

  const first = await generateText({
    model,
    messages: [firstUserMessage],
  });

  await generateText({
    model,
    messages: [
      firstUserMessage,
      ...first.response.messages,
      {
        role: 'user',
        content: 'Now multiply that result by 3. Reply with only the result.',
      },
    ],
  });

  const rawFirstContent = responses[0]?.choices[0]?.message.content;
  if (
    !Array.isArray(rawFirstContent) ||
    rawFirstContent[0]?.type !== 'thinking' ||
    rawFirstContent[0].closed !== true ||
    rawFirstContent[1]?.type !== 'text'
  ) {
    throw new Error(
      'Live Mistral response did not contain a closed thinking chunk followed by a text chunk.',
    );
  }

  const directResponse = await fetch(
    'https://api.mistral.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        reasoning_effort: 'high',
        messages: [
          {
            role: 'user',
            content: 'What is 17 * 23? Reply with only the result.',
          },
          { role: 'assistant', content: rawFirstContent },
          {
            role: 'user',
            content:
              'Now multiply that result by 3. Reply with only the result.',
          },
        ],
      }),
    },
  );
  const directBody = (await directResponse.json()) as MistralResponse;
  const directContent = directBody.choices?.[0]?.message.content;
  const directAnswer = Array.isArray(directContent)
    ? directContent
        .filter(
          (chunk): chunk is Extract<MistralContentChunk, { type: 'text' }> =>
            chunk.type === 'text',
        )
        .map(chunk => chunk.text)
        .join('')
    : directContent;

  if (!directResponse.ok || directAnswer?.trim() !== '1173') {
    throw new Error(
      `Direct structured replay did not succeed: HTTP ${directResponse.status}`,
    );
  }

  const replayedAssistantContent = requests[1]?.messages[1]?.content;
  const reasoningText = rawFirstContent[0].thinking
    .map(chunk => chunk.text)
    .join('');
  const visibleAnswer = rawFirstContent[1].text;

  if (
    typeof replayedAssistantContent === 'string' &&
    replayedAssistantContent === reasoningText + visibleAnswer
  ) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  if (
    !Array.isArray(replayedAssistantContent) ||
    replayedAssistantContent[0]?.type !== 'thinking' ||
    replayedAssistantContent[0]?.closed !== true ||
    replayedAssistantContent[1]?.type !== 'text'
  ) {
    throw new Error(
      'Second request did not preserve the complete structured assistant message.',
    );
  }

  console.log('Mistral reasoning history was preserved.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
