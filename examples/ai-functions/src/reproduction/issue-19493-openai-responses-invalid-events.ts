import { createOpenAI } from '@ai-sdk/openai';
import fs from 'node:fs';
import path from 'node:path';

type StreamObservation = {
  types: string[];
  warningCount: number;
  errorCount: number;
  finishReason: string | undefined;
};

const fixture = fs.readFileSync(
  path.join(
    process.cwd(),
    '../../packages/openai/src/responses/__fixtures__/issue-19493-gpt-5.1-tool-call.chunks.txt',
  ),
  'utf8',
);

function createStream({ omitOutputIndex }: { omitOutputIndex: boolean }) {
  return fixture
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => {
      const chunk = JSON.parse(line);
      if (omitOutputIndex && 'output_index' in chunk) {
        delete chunk.output_index;
      }
      return `data: ${JSON.stringify(chunk)}\n\n`;
    })
    .join('');
}

async function observe(omitOutputIndex: boolean): Promise<StreamObservation> {
  const provider = createOpenAI({
    apiKey: 'test-api-key',
    baseURL: 'https://example.invalid/v1',
    fetch: async () =>
      new Response(createStream({ omitOutputIndex }), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const { stream } = await provider.responses('gpt-5.1').doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Call get_weather for Beijing.' }],
      },
    ],
  });

  const observation: StreamObservation = {
    types: [],
    warningCount: 0,
    errorCount: 0,
    finishReason: undefined,
  };

  const reader = stream.getReader();
  for (;;) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }

    observation.types.push(part.type);
    if (part.type === 'stream-start') {
      observation.warningCount = part.warnings.length;
    } else if (part.type === 'error') {
      observation.errorCount++;
    } else if (part.type === 'finish') {
      observation.finishReason = part.finishReason.unified;
    }
  }

  return observation;
}

async function main() {
  const valid = await observe(false);
  if (
    !valid.types.includes('tool-call') ||
    valid.finishReason !== 'tool-calls'
  ) {
    throw new Error(
      `Valid fixture precondition failed: ${JSON.stringify(valid)}`,
    );
  }

  const malformed = await observe(true);
  const validationWasSignaled =
    malformed.warningCount > 0 || malformed.errorCount > 0;

  if (!validationWasSignaled || malformed.finishReason === 'stop') {
    console.error(
      'ISSUE_19493_REPRODUCED: malformed completed tool call was silently dropped or finished as stop',
    );
    console.error(JSON.stringify({ valid, malformed }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Malformed Responses events were signaled without a stop finish.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
