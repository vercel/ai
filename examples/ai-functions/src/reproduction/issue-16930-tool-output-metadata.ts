import {
  isToolOrDynamicToolUIPart,
  readUIMessageStream,
  simulateReadableStream,
  type UIMessageChunk,
} from 'ai';

type ReproductionCase = {
  dynamic: boolean;
  outputType: 'tool-output-available' | 'tool-output-error';
  hasInputMetadata: boolean;
};

const cases: ReproductionCase[] = [
  {
    dynamic: true,
    outputType: 'tool-output-available',
    hasInputMetadata: false,
  },
  {
    dynamic: true,
    outputType: 'tool-output-available',
    hasInputMetadata: true,
  },
  {
    dynamic: true,
    outputType: 'tool-output-error',
    hasInputMetadata: false,
  },
  {
    dynamic: true,
    outputType: 'tool-output-error',
    hasInputMetadata: true,
  },
  {
    dynamic: false,
    outputType: 'tool-output-available',
    hasInputMetadata: false,
  },
  {
    dynamic: false,
    outputType: 'tool-output-available',
    hasInputMetadata: true,
  },
  {
    dynamic: false,
    outputType: 'tool-output-error',
    hasInputMetadata: false,
  },
  {
    dynamic: false,
    outputType: 'tool-output-error',
    hasInputMetadata: true,
  },
];

function isDeepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function runCase(testCase: ReproductionCase) {
  const label = [
    testCase.dynamic ? 'dynamic' : 'static',
    testCase.outputType,
    testCase.hasInputMetadata ? 'stale-input-metadata' : 'no-input-metadata',
  ].join('/');
  const inputMetadata = testCase.hasInputMetadata
    ? { phase: 'input', label }
    : undefined;
  const expectedOutputMetadata = { phase: 'output', label };
  const resultProviderMetadata = {
    testProvider: { phase: 'output', label },
  };
  const dynamic = testCase.dynamic ? { dynamic: true as const } : {};

  const outputChunk: UIMessageChunk =
    testCase.outputType === 'tool-output-available'
      ? {
          type: 'tool-output-available',
          toolCallId: 'call-1',
          output: { ok: true },
          providerMetadata: resultProviderMetadata,
          toolMetadata: expectedOutputMetadata,
          ...dynamic,
        }
      : {
          type: 'tool-output-error',
          toolCallId: 'call-1',
          errorText: 'tool failed',
          providerMetadata: resultProviderMetadata,
          toolMetadata: expectedOutputMetadata,
          ...dynamic,
        };

  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: `message-${label}` },
    {
      type: 'tool-input-start',
      toolCallId: 'call-1',
      toolName: 'myTool',
      ...(inputMetadata == null ? {} : { toolMetadata: inputMetadata }),
      ...dynamic,
    },
    {
      type: 'tool-input-available',
      toolCallId: 'call-1',
      toolName: 'myTool',
      input: { q: 1 },
      ...(inputMetadata == null ? {} : { toolMetadata: inputMetadata }),
      ...dynamic,
    },
    outputChunk,
    { type: 'finish' },
  ];

  let lastMessage;
  for await (const message of readUIMessageStream({
    stream: simulateReadableStream({
      chunks,
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
    }),
  })) {
    lastMessage = message;
  }

  const expectedPartType = testCase.dynamic ? 'dynamic-tool' : 'tool-myTool';
  const toolPart = lastMessage?.parts.find(
    part => part.type === expectedPartType && part.toolCallId === 'call-1',
  );

  if (toolPart == null || !isToolOrDynamicToolUIPart(toolPart)) {
    throw new Error(
      `Reproduction setup failed: missing tool part for ${label}`,
    );
  }

  if (
    testCase.outputType === 'tool-output-available' &&
    (toolPart.state !== 'output-available' ||
      !isDeepEqual(toolPart.output, { ok: true }))
  ) {
    throw new Error(
      `Reproduction setup failed: output was not applied for ${label}`,
    );
  }

  if (
    testCase.outputType === 'tool-output-error' &&
    (toolPart.state !== 'output-error' || toolPart.errorText !== 'tool failed')
  ) {
    throw new Error(
      `Reproduction setup failed: output error was not applied for ${label}`,
    );
  }

  const actualResultProviderMetadata =
    'resultProviderMetadata' in toolPart
      ? toolPart.resultProviderMetadata
      : undefined;

  if (!isDeepEqual(actualResultProviderMetadata, resultProviderMetadata)) {
    throw new Error(
      `Reproduction setup failed: provider metadata was not applied for ${label}`,
    );
  }

  return {
    label,
    expectedToolMetadata: expectedOutputMetadata,
    actualToolMetadata: toolPart.toolMetadata,
    matches: isDeepEqual(toolPart.toolMetadata, expectedOutputMetadata),
  };
}

async function main() {
  const results = [];

  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }

  console.log(JSON.stringify(results, null, 2));

  const failures = results.filter(result => !result.matches);
  if (failures.length > 0) {
    throw new Error(
      `ISSUE_16930_REPRODUCED: tool output metadata was discarded in ${failures.length} of ${results.length} cases`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
