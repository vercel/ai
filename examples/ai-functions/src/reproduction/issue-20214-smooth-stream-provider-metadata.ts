import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

const signature = 'sig-r1';

function getAnthropicSignature(
  part: TextStreamPart<ToolSet>,
): string | undefined {
  if (!('providerMetadata' in part)) {
    return undefined;
  }

  const value = part.providerMetadata?.anthropic?.signature;
  return typeof value === 'string' ? value : undefined;
}

async function main() {
  const chunks: Array<TextStreamPart<ToolSet>> = [
    { type: 'reasoning-start', id: 'r1' },
    { type: 'reasoning-delta', id: 'r1', text: 'Let me think. ' },
    {
      type: 'reasoning-delta',
      id: 'r1',
      text: '',
      providerMetadata: { anthropic: { signature } },
    },
    { type: 'reasoning-end', id: 'r1' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', text: 'Hello world' },
    { type: 'text-end', id: 't1' },
  ];

  const input = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  const output: Array<TextStreamPart<ToolSet>> = [];
  const reader = input
    .pipeThrough(smoothStream({ delayInMs: null })({ tools: {} }))
    .getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    output.push(value);
  }

  let reasoningText = '';
  let text = '';

  for (const part of output) {
    if (part.type === 'reasoning-delta' && part.id === 'r1') {
      reasoningText += part.text;
    } else if (part.type === 'text-delta' && part.id === 't1') {
      text += part.text;
    }
  }

  if (reasoningText !== 'Let me think. ' || text !== 'Hello world') {
    throw new Error(
      `Reproduction harness did not preserve source content: ${JSON.stringify(output)}`,
    );
  }

  const signatureParts = output.filter(
    part => getAnthropicSignature(part) === signature,
  );
  const reasoningSignatureParts = signatureParts.filter(
    part => part.type === 'reasoning-delta' && part.id === 'r1',
  );
  const textSignatureParts = signatureParts.filter(
    part => part.type === 'text-delta' && part.id === 't1',
  );

  if (
    reasoningSignatureParts.length === 0 &&
    textSignatureParts.length === 1 &&
    signatureParts.length === 1
  ) {
    throw new Error(
      'ISSUE #20214 REPRODUCED: smoothStream dropped the reasoning signature and leaked it onto text part t1',
    );
  }

  if (reasoningSignatureParts.length !== 1 || signatureParts.length !== 1) {
    throw new Error(
      `Unexpected signature placement: ${JSON.stringify(signatureParts)}`,
    );
  }

  console.log(
    'Issue #20214 is not present: the signature was emitted exactly once on reasoning part r1.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
