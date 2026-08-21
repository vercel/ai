import fs from 'node:fs/promises';

type MessageStart = {
  type: 'message_start';
  message: {
    model: string;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
};

type MessageDelta = {
  type: 'message_delta';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

function readEvent<T>(stream: string, eventType: string): T {
  const block = stream
    .split('\n\n')
    .find(block => block.startsWith(`event: ${eventType}\n`));

  if (block == null) {
    throw new Error(`Missing ${eventType} event`);
  }

  return JSON.parse(block.slice(block.indexOf('data: ') + 6)) as T;
}

async function readFixture(filename: string) {
  return fs.readFile(
    new URL(
      `../../../../packages/gateway/src/__fixtures__/${filename}`,
      import.meta.url,
    ),
    'utf8',
  );
}

async function main() {
  const failures: string[] = [];

  for (const filename of [
    'issue-17326-xai-grok-4.5.chunks.txt',
    'issue-17326-anthropic-claude-haiku-4.5.chunks.txt',
  ]) {
    const stream = await readFixture(filename);
    const start = readEvent<MessageStart>(stream, 'message_start');
    const delta = readEvent<MessageDelta>(stream, 'message_delta');
    const { model, usage: startUsage } = start.message;
    const finalUsage = delta.usage;

    console.log(
      `${model}: message_start=${startUsage.input_tokens}/${startUsage.output_tokens}, message_delta=${finalUsage.input_tokens}/${finalUsage.output_tokens}`,
    );

    if (
      startUsage.input_tokens === 0 &&
      startUsage.output_tokens === 0 &&
      (finalUsage.input_tokens > 0 || finalUsage.output_tokens > 0)
    ) {
      failures.push(
        `message_start usage is 0/0 for ${model} while terminal usage is non-zero`,
      );
    }
  }

  const countTokensResponse = await readFixture(
    'issue-17326-xai-grok-4.5-count-tokens.txt',
  );
  const countTokensStatus = Number(
    countTokensResponse.match(/HTTP_STATUS:(\d+)/)?.[1],
  );
  console.log(`xai/grok-4.5 count_tokens status=${countTokensStatus}`);

  if (countTokensStatus === 404) {
    failures.push('count_tokens returns 404 for xai/grok-4.5');
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`ISSUE #17326 REPRODUCED: ${failure}`);
    }
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
