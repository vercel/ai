import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUIMessageStream, type UIMessageChunk } from 'ai';

type CaseName =
  | 'full-consumption-default'
  | 'iterator-break-default'
  | 'reader-cancel-default'
  | 'iterator-break-terminate'
  | 'reader-cancel-terminate';

const chunks: UIMessageChunk[] = [
  { type: 'start', messageId: 'example-message' },
  { type: 'text-start', id: 'text-1' },
  { type: 'text-delta', id: 'text-1', delta: 'Hello.' },
  { type: 'text-end', id: 'text-1' },
  { type: 'finish', finishReason: 'stop' },
];

function hasText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts.some(
    part => part.type === 'text' && (part.text?.length ?? 0) > 0,
  );
}

async function runChild(caseName: CaseName) {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const output = readUIMessageStream({
    stream,
    terminateOnError: caseName.endsWith('-terminate'),
  });

  let receivedText = false;

  if (caseName === 'full-consumption-default') {
    for await (const message of output) {
      receivedText ||= hasText(message);
    }
  } else if (caseName.startsWith('iterator-break')) {
    for await (const message of output) {
      if (hasText(message)) {
        receivedText = true;
        break;
      }
    }
  } else {
    const reader = output.getReader();

    while (true) {
      const { done, value } = await reader.read();
      assert.equal(done, false, `${caseName} ended before emitting text`);

      if (hasText(value)) {
        receivedText = true;
        break;
      }
    }

    await reader.cancel();
  }

  assert.equal(receivedText, true, `${caseName} did not emit text`);
  console.log(`${caseName} returned without an unhandled rejection`);
}

async function main() {
  if (process.argv[2] === '--child') {
    await runChild(process.argv[3] as CaseName);
    return;
  }

  const caseNames: CaseName[] = [
    'full-consumption-default',
    'iterator-break-default',
    'reader-cancel-default',
    'iterator-break-terminate',
    'reader-cancel-terminate',
  ];
  const closedControllerFailures: CaseName[] = [];

  for (const caseName of caseNames) {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url), '--child', caseName],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
      },
    );
    const output = `${result.stdout}${result.stderr}`;
    const returned = output.includes(
      `${caseName} returned without an unhandled rejection`,
    );
    const closedControllerRejection =
      output.includes('TypeError [ERR_INVALID_STATE]') &&
      output.includes('Invalid state: Controller is already closed');

    console.log(`${caseName}: exit ${result.status ?? 'null'}`);

    if (result.status !== 0 && returned && closedControllerRejection) {
      closedControllerFailures.push(caseName);
      continue;
    }

    assert.equal(
      result.status,
      0,
      `${caseName} failed for a reason other than the reported closed-controller rejection:\n${output}`,
    );
    assert.equal(
      closedControllerRejection,
      false,
      `${caseName} emitted the reported closed-controller rejection`,
    );
  }

  assert.deepEqual(
    closedControllerFailures,
    [],
    'ISSUE_20991_REPRODUCED: iterator break and reader.cancel() returned, then caused unhandled ERR_INVALID_STATE closed-controller rejections',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
