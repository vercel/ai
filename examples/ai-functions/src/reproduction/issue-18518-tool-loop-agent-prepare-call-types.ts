import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ToolLoopAgent, tool, type ToolLoopAgentSettings } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import ts from 'typescript';
import { z } from 'zod/v4';

const successfulResponse = {
  content: [{ type: 'text' as const, text: 'done' }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    cachedInputTokens: undefined,
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 1,
      text: 1,
      reasoning: undefined,
    },
  },
  warnings: [],
};

const tools = {
  testTool: tool({
    inputSchema: z.object({ value: z.string() }),
    execute: async ({ value }) => `result-${value}`,
  }),
};

const constructorPrepareStep = () => {
  throw new Error('constructor prepareStep should have been overridden');
};
const constructorRepairToolCall = async () => {
  throw new Error('constructor repairToolCall should have been overridden');
};
const constructorExperimentalRepairToolCall = async () => {
  throw new Error(
    'constructor experimental_repairToolCall should have been overridden',
  );
};

type PrepareCallResult = Awaited<
  ReturnType<NonNullable<ToolLoopAgentSettings['prepareCall']>>
>;
type RepairToolCallOptions = Parameters<
  NonNullable<ToolLoopAgentSettings<never, typeof tools>['repairToolCall']>
>[0];

// These each fail because the prepareCall return Pick omits runtime-supported
// settings. Keeping them separate makes every omitted key produce a diagnostic.
const toolChoiceOverride = {
  toolChoice: 'none',
} satisfies Partial<PrepareCallResult>;
const maxRetriesOverride = {
  maxRetries: 0,
} satisfies Partial<PrepareCallResult>;
const prepareStepOverride = {
  prepareStep: () => undefined,
} satisfies Partial<PrepareCallResult>;
const repairToolCallOverride = {
  repairToolCall: async () => null,
} satisfies Partial<PrepareCallResult>;
const experimentalRepairToolCallOverride = {
  experimental_repairToolCall: async () => null,
} satisfies Partial<PrepareCallResult>;

void [
  toolChoiceOverride,
  maxRetriesOverride,
  prepareStepOverride,
  repairToolCallOverride,
  experimentalRepairToolCallOverride,
];

async function verifyRuntimeContract() {
  let generateCall = 0;
  let overridePrepareStepCalls = 0;
  let overrideRepairToolCallCalls = 0;

  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      generateCall++;

      if (generateCall === 1) {
        assert.deepEqual(options.toolChoice, { type: 'none' });
        return {
          ...successfulResponse,
          content: [
            {
              type: 'tool-call' as const,
              toolCallType: 'function' as const,
              toolCallId: 'call-1',
              toolName: 'testTool',
              input: '{ "value": broken',
            },
          ],
        };
      }

      return successfulResponse;
    },
  });

  const agent = new ToolLoopAgent({
    model,
    tools,
    toolChoice: 'auto',
    maxRetries: 5,
    prepareStep: constructorPrepareStep,
    repairToolCall: constructorRepairToolCall,
    experimental_repairToolCall: constructorExperimentalRepairToolCall,
    prepareCall: settings => {
      // All five values are present at runtime, but both prepareCall Pick lists
      // reject these property accesses during type checking.
      assert.equal(settings.toolChoice, 'auto');
      assert.equal(settings.maxRetries, 5);
      assert.equal(settings.prepareStep, constructorPrepareStep);
      assert.equal(settings.repairToolCall, constructorRepairToolCall);
      assert.equal(
        settings.experimental_repairToolCall,
        constructorExperimentalRepairToolCall,
      );

      // These fields are accepted by the input type but are destructured out
      // before prepareCall runs.
      for (const absentCallField of [
        'abortSignal',
        'timeout',
        'onStart',
        'experimental_onStart',
        'onStepStart',
        'experimental_onStepStart',
        'onToolExecutionStart',
        'onToolExecutionEnd',
        'onEnd',
        'onFinish',
      ] as const) {
        assert.equal(absentCallField in settings, false);
      }

      // The existing input type advertises these properties.
      void settings.abortSignal;
      void settings.timeout;
      void settings.onStart;
      void settings.experimental_onStart;
      void settings.onStepStart;
      void settings.experimental_onStepStart;
      void settings.onToolExecutionStart;
      void settings.onToolExecutionEnd;
      void settings.onEnd;
      void settings.onFinish;

      return {
        ...settings,
        toolChoice: 'none',
        maxRetries: 0,
        prepareStep: () => {
          overridePrepareStepCalls++;
          return undefined;
        },
        repairToolCall: async ({ toolCall }: RepairToolCallOptions) => {
          overrideRepairToolCallCalls++;
          return {
            ...toolCall,
            input: '{ "value": "repaired" }',
          };
        },
      };
    },
  });

  const abortController = new AbortController();
  const noop = async () => {};
  const result = await agent.generate({
    prompt: 'test',
    abortSignal: abortController.signal,
    timeout: 10_000,
    onStart: noop,
    experimental_onStart: noop,
    onStepStart: noop,
    experimental_onStepStart: noop,
    onToolExecutionStart: noop,
    onToolExecutionEnd: noop,
    onEnd: noop,
    onFinish: noop,
  });

  assert.equal(result.text, 'done');
  assert.equal(overridePrepareStepCalls, 2);
  assert.equal(overrideRepairToolCallCalls, 1);

  let deprecatedRepairCalls = 0;
  let deprecatedGenerateCall = 0;
  const deprecatedModel = new MockLanguageModelV4({
    doGenerate: async () => {
      deprecatedGenerateCall++;
      return deprecatedGenerateCall === 1
        ? {
            ...successfulResponse,
            content: [
              {
                type: 'tool-call' as const,
                toolCallType: 'function' as const,
                toolCallId: 'call-2',
                toolName: 'testTool',
                input: '{ "value": broken',
              },
            ],
          }
        : successfulResponse;
    },
  });

  const deprecatedAgent = new ToolLoopAgent({
    model: deprecatedModel,
    tools,
    experimental_repairToolCall: constructorExperimentalRepairToolCall,
    prepareCall: settings => ({
      ...settings,
      repairToolCall: undefined,
      experimental_repairToolCall: async ({
        toolCall,
      }: RepairToolCallOptions) => {
        deprecatedRepairCalls++;
        return {
          ...toolCall,
          input: '{ "value": "deprecated-repair" }',
        };
      },
    }),
  });

  await deprecatedAgent.generate({ prompt: 'test' });
  assert.equal(deprecatedRepairCalls, 1);

  let retryAttempts = 0;
  const retryModel = new MockLanguageModelV4({
    doGenerate: async () => {
      retryAttempts++;
      throw new Error('expected model failure');
    },
  });
  const retryAgent = new ToolLoopAgent({
    model: retryModel,
    maxRetries: 2,
    prepareCall: settings => ({
      ...settings,
      maxRetries: 0,
    }),
  });

  await assert.rejects(
    retryAgent.generate({ prompt: 'test' }),
    /expected model failure/,
  );
  assert.equal(retryAttempts, 1);
}

function verifyReportedTypeErrors() {
  const fileName = fileURLToPath(import.meta.url);
  const program = ts.createProgram([fileName], {
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const messages = diagnostics.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );

  for (const property of [
    'toolChoice',
    'maxRetries',
    'prepareStep',
    'repairToolCall',
    'experimental_repairToolCall',
  ]) {
    assert.ok(
      diagnostics.some(
        (diagnostic, index) =>
          [2339, 2551].includes(diagnostic.code) &&
          messages[index].includes(`Property '${property}' does not exist`),
      ),
      `missing expected prepareCall input diagnostic for ${property}`,
    );
    assert.ok(
      diagnostics.some(
        (diagnostic, index) =>
          [2353, 2561].includes(diagnostic.code) &&
          messages[index].includes(`'${property}' does not exist`),
      ),
      `missing expected prepareCall return diagnostic for ${property}`,
    );
  }
}

async function main() {
  await verifyRuntimeContract();
  verifyReportedTypeErrors();
  console.error(
    'ISSUE_18518_REPRODUCED: prepareCall types reject runtime-supported toolChoice, maxRetries, prepareStep, repairToolCall, and experimental_repairToolCall',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
