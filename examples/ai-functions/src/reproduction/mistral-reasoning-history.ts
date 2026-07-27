import { createMistral } from '@ai-sdk/mistral';
import { generateText, type ModelMessage } from 'ai';

const failureSignal =
  'ISSUE #17930 REPRODUCED: second request flattened Mistral thinking and text chunks into a plain string, dropped closed metadata, and appended the visible answer';

async function main() {
  const requests: Array<Record<string, any>> = [];
  const responses: Array<Record<string, any>> = [];

  const recordingFetch: typeof fetch = async (input, init) => {
    if (typeof init?.body === 'string') {
      requests.push(JSON.parse(init.body));
    }

    const response = await fetch(input, init);
    const responseBody = await response.clone().json();
    responses.push(responseBody);

    return response;
  };

  const apiKey = process.env.MISTRAL_API_KEY!;
  const mistral = createMistral({ apiKey, fetch: recordingFetch });
  const model = mistral('mistral-small-latest');
  const providerOptions = {
    mistral: { reasoningEffort: 'high' as const },
  };

  const firstUserMessage: ModelMessage = {
    role: 'user',
    content: 'What is 17 * 23? Reply with only the result.',
  };
  const secondUserMessage: ModelMessage = {
    role: 'user',
    content: 'Now multiply that result by 3. Reply with only the result.',
  };

  const first = await generateText({
    model,
    messages: [firstUserMessage],
    providerOptions,
  });

  await generateText({
    model,
    messages: [firstUserMessage, ...first.response.messages, secondUserMessage],
    providerOptions,
  });

  const firstContent = responses[0]?.choices?.[0]?.message?.content;
  const replayedAssistant = requests[1]?.messages?.[1];

  if (!Array.isArray(firstContent)) {
    throw new Error(
      `Expected the live provider to return structured reasoning chunks, received ${JSON.stringify(firstContent)}`,
    );
  }

  const thinkingChunk = firstContent.find(
    (part: any) => part.type === 'thinking',
  );
  const textChunk = firstContent.find((part: any) => part.type === 'text');

  if (
    thinkingChunk?.closed !== true ||
    !Array.isArray(thinkingChunk.thinking) ||
    typeof textChunk?.text !== 'string'
  ) {
    throw new Error(
      `Expected a closed thinking chunk and a text chunk, received ${JSON.stringify(firstContent)}`,
    );
  }

  const reasoningText = thinkingChunk.thinking
    .filter((part: any) => part.type === 'text')
    .map((part: any) => part.text)
    .join('');
  const flattenedContent = `${reasoningText}${textChunk.text}`;

  const directResponse = await fetch(
    'https://api.mistral.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          requests[0].messages[0],
          responses[0].choices[0].message,
          requests[1].messages[2],
        ],
        reasoning_effort: 'high',
      }),
    },
  );
  const directBody: any = await directResponse.json();

  if (!directResponse.ok) {
    throw new Error(
      `Direct structured replay failed with HTTP ${directResponse.status}: ${JSON.stringify(directBody)}`,
    );
  }

  const directContent = directBody?.choices?.[0]?.message?.content;
  const directAnswer = Array.isArray(directContent)
    ? directContent
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('')
    : directContent;

  if (directAnswer?.trim() !== '1173') {
    throw new Error(
      `Expected direct structured replay to produce 1173, received ${JSON.stringify(directAnswer)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        firstContent,
        replayedAssistant,
        directStructuredReplay: {
          status: directResponse.status,
          answer: directAnswer,
        },
      },
      null,
      2,
    ),
  );

  if (
    typeof replayedAssistant?.content === 'string' &&
    replayedAssistant.content === flattenedContent &&
    reasoningText.includes(textChunk.text)
  ) {
    throw new Error(failureSignal);
  }

  if (
    !Array.isArray(replayedAssistant?.content) ||
    replayedAssistant.content[0]?.type !== 'thinking' ||
    replayedAssistant.content[0]?.closed !== true
  ) {
    throw new Error(
      `Expected the second request to preserve the closed thinking chunk, received ${JSON.stringify(replayedAssistant)}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
