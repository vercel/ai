import { createMistral } from '@ai-sdk/mistral';
import { generateText, type ModelMessage } from 'ai';

async function main() {
  const requests: Array<Record<string, unknown>> = [];
  const responses: Array<Record<string, any>> = [];

  const recordingFetch: typeof fetch = async (input, init) => {
    if (typeof init?.body === 'string') {
      requests.push(JSON.parse(init.body));
    }

    const response = await fetch(input, init);
    responses.push(await response.clone().json());
    return response;
  };

  const mistral = createMistral({
    apiKey: process.env.MISTRAL_API_KEY!,
    fetch: recordingFetch,
  });

  const model = mistral('mistral-small-latest');
  const providerOptions = {
    mistral: { reasoningEffort: 'high' as const },
  };
  const firstUserMessage: ModelMessage = {
    role: 'user',
    content: 'What is 17 * 23? Reply with only the result.',
  };

  const first = await generateText({
    model,
    messages: [firstUserMessage],
    providerOptions,
  });

  const directReplayResponse = await fetch(
    'https://api.mistral.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.MISTRAL_API_KEY!}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        reasoning_effort: 'high',
        messages: [
          (requests[0].messages as Array<any>)[0],
          responses[0].choices[0].message,
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Now multiply that result by 3. Reply with only the result.',
              },
            ],
          },
        ],
      }),
    },
  );
  const directReplayBody = await directReplayResponse.json();

  if (!directReplayResponse.ok) {
    throw new Error(
      `DIRECT_MISTRAL_REPLAY_FAILED: ${directReplayResponse.status} ${JSON.stringify(directReplayBody)}`,
    );
  }

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
    providerOptions,
  });

  const firstContent = responses[0]?.choices?.[0]?.message?.content;
  const replayedAssistant = (requests[1]?.messages as Array<any>)?.find(
    message => message.role === 'assistant',
  );

  console.log(
    JSON.stringify(
      {
        firstResponse: responses[0],
        directReplayStatus: directReplayResponse.status,
        directReplayContent: directReplayBody.choices?.[0]?.message?.content,
        replayedAssistant,
      },
      null,
      2,
    ),
  );

  const firstThinking = Array.isArray(firstContent)
    ? firstContent.find(part => part.type === 'thinking')
    : undefined;
  const firstText = Array.isArray(firstContent)
    ? firstContent.find(part => part.type === 'text')
    : undefined;

  if (firstThinking == null || firstText == null) {
    throw new Error(
      'LIVE_RESPONSE_DID_NOT_CONTAIN_SEPARATE_THINKING_AND_TEXT_CHUNKS',
    );
  }

  const replayedContent = replayedAssistant?.content;
  const preserved =
    Array.isArray(replayedContent) &&
    replayedContent.some(
      part =>
        part.type === 'thinking' &&
        part.closed === firstThinking.closed &&
        JSON.stringify(part.thinking) ===
          JSON.stringify(firstThinking.thinking),
    ) &&
    replayedContent.some(
      part => part.type === 'text' && part.text === firstText.text,
    );

  if (!preserved) {
    throw new Error(
      'MISTRAL_REASONING_HISTORY_FLATTENED: expected the second request to preserve the thinking and text chunks',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
