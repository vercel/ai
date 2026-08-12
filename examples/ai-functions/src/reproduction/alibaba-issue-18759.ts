import { createAlibaba } from '@ai-sdk/alibaba';
import { readFile } from 'node:fs/promises';
import { generateText, type ModelMessage } from 'ai';

async function main() {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/alibaba/src/__fixtures__/alibaba-issue-18759.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const requests: Array<{
    messages: Array<{ role: string; content: unknown }>;
  }> = [];

  const recordingFetch: typeof fetch = async (_input, init) => {
    if (typeof init?.body === 'string') {
      requests.push(JSON.parse(init.body));
    }

    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const model = createAlibaba({
    apiKey: 'test-api-key',
    fetch: recordingFetch,
  })('qwen-plus');

  const providerOptions = {
    alibaba: { enableThinking: true },
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

  const assistantResponse = first.response.messages.find(
    message => message.role === 'assistant',
  );

  if (
    assistantResponse == null ||
    typeof assistantResponse.content === 'string'
  ) {
    throw new Error('Alibaba response did not contain structured content.');
  }

  const visibleText = assistantResponse.content.find(
    part => part.type === 'text',
  )?.text;
  const historicalReasoning = assistantResponse.content.find(
    part => part.type === 'reasoning',
  )?.text;

  if (visibleText !== '391' || historicalReasoning == null) {
    throw new Error(
      'Recorded Alibaba response did not map to separate text and reasoning parts.',
    );
  }

  const replayedAssistant = requests[1].messages.find(
    message => message.role === 'assistant',
  );

  if (replayedAssistant?.content !== visibleText) {
    console.error(
      'ISSUE_18759_REPRODUCED: historical reasoning was replayed as visible assistant content',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Historical reasoning was omitted from visible assistant content.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
