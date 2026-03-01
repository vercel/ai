import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';

type OpenAIContainer = {
  id: string;
  status?: string;
  memory_limit?: '1g' | '4g' | '16g' | '64g';
  [key: string]: unknown;
};

async function retrieveContainer(
  containerId: string,
): Promise<OpenAIContainer> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const response = await fetch(
    `https://api.openai.com/v1/containers/${containerId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to retrieve container: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as OpenAIContainer;
}

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-nano'),
    tools: {
      code_interpreter: openai.tools.codeInterpreter({
        container: {
          memoryLimit: '4g',
        },
      }),
    },
    prompt:
      'Simulate rolling two dice 10000 times and, return the sum of all the results, and upload the result to a file.',
    stopWhen: stepCountIs(5),
  });

  type CallCodeInterpreterToolCall = {
    type: 'tool-call';
    toolCallId: string;
    toolName: 'code_interpreter';
    input: {
      code: string;
      containerId: string;
    };
  };
  const codeInterpreter = result.content.find(
    content =>
      content.type === 'tool-call' && content.toolName === 'code_interpreter',
  ) as CallCodeInterpreterToolCall | undefined;
  if (!codeInterpreter) {
    console.log('container failed');
    return;
  }
  const {
    input: { containerId },
  } = codeInterpreter;
  console.log(`containerId: ${containerId}`);

  const container = await retrieveContainer(containerId);
  console.log('container memory_limit:', container.memory_limit);
  console.log('container detail:', container);
});
