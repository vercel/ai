import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

const providerMetadata = {
  anthropic: { signature: 'sig_issue_14373' },
};

async function main() {
  async function collect({
    chunking,
    parts,
  }: {
    chunking: 'word' | 'line';
    parts: TextStreamPart<ToolSet>[];
  }) {
    const input = new ReadableStream<TextStreamPart<ToolSet>>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    });
    const output = input.pipeThrough(
      smoothStream({ chunking, delayInMs: null })({ tools: {} }),
    );
    const result: TextStreamPart<ToolSet>[] = [];
    const reader = output.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result.push(value);
    }

    return result;
  }

  const wordParts = await collect({
    chunking: 'word',
    parts: [
      { type: 'reasoning-start', id: 'reasoning-1' },
      {
        type: 'reasoning-delta',
        id: 'reasoning-1',
        text: 'First second final',
        providerMetadata,
      },
      { type: 'reasoning-end', id: 'reasoning-1' },
    ],
  });
  const lineParts = await collect({
    chunking: 'line',
    parts: [
      { type: 'text-start', id: 'text-1' },
      {
        type: 'text-delta',
        id: 'text-1',
        text: 'First\nSecond\nFinal',
        providerMetadata,
      },
      { type: 'text-end', id: 'text-1' },
    ],
  });

  const scenarios = [
    {
      name: 'word reasoning-delta',
      deltas: wordParts.filter(part => part.type === 'reasoning-delta'),
      expectedTexts: ['First ', 'second ', 'final'],
    },
    {
      name: 'line text-delta',
      deltas: lineParts.filter(part => part.type === 'text-delta'),
      expectedTexts: ['First\n', 'Second\n', 'Final'],
    },
  ];

  for (const scenario of scenarios) {
    const actualTexts = scenario.deltas.map(part => part.text);
    if (
      JSON.stringify(actualTexts) !== JSON.stringify(scenario.expectedTexts)
    ) {
      throw new Error(
        `Unexpected ${scenario.name} chunks: ${JSON.stringify(actualTexts)}`,
      );
    }
  }

  console.log(JSON.stringify(scenarios, null, 2));

  const droppedMetadata = scenarios.some(scenario =>
    scenario.deltas.some(
      part =>
        JSON.stringify(part.providerMetadata) !==
        JSON.stringify(providerMetadata),
    ),
  );

  if (droppedMetadata) {
    console.error(
      'ISSUE_14373_REPRODUCED: smoothStream dropped providerMetadata from chunked stream parts',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'All smoothStream chunked stream parts preserved providerMetadata.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
