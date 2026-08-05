import { spawnSync } from 'node:child_process';
import { ToolLoopAgent, type ToolLoopAgentSettings } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type PrepareCall = NonNullable<ToolLoopAgentSettings['prepareCall']>;
type PrepareCallResult = Awaited<ReturnType<PrepareCall>>;

function reproduceTypeErrors() {
  new ToolLoopAgent({
    model: 'openai/gpt-5.2',
    reasoning: 'medium',
    prepareCall: settings => ({
      ...settings,
      reasoning: settings.reasoning ?? 'high',
    }),
  });

  const preparedOverride = {
    reasoning: 'high',
  } satisfies Partial<PrepareCallResult>;

  return preparedOverride;
}

async function verifyRuntimeContract() {
  let receivedReasoning: unknown;
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
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
    },
  });

  const agent = new ToolLoopAgent({
    model,
    reasoning: 'medium',
    prepareCall: settings => {
      const runtimeSettings = settings as typeof settings &
        Pick<ToolLoopAgentSettings, 'reasoning'>;
      receivedReasoning = runtimeSettings.reasoning;

      return {
        ...settings,
        reasoning: 'high',
      };
    },
  });

  await agent.generate({ prompt: 'Test' });

  if (
    receivedReasoning !== 'medium' ||
    model.doGenerateCalls[0]?.reasoning !== 'high'
  ) {
    throw new Error(
      'The reported prepareCall runtime contract was not observed',
    );
  }
}

async function main() {
  await verifyRuntimeContract();

  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--noEmit',
      '--pretty',
      'false',
      '--strict',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--types',
      'node',
      'src/reproduction/issue-18478-tool-loop-agent-reasoning.ts',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  const output = `${result.stdout}${result.stderr}`;
  const inputTypeOmitsReasoning = output.includes(
    "error TS2339: Property 'reasoning' does not exist",
  );
  const returnTypeOmitsReasoning = output.includes(
    "error TS2353: Object literal may only specify known properties, and 'reasoning' does not exist",
  );

  if (inputTypeOmitsReasoning && returnTypeOmitsReasoning) {
    console.error(output.trim());
    console.error(
      'ISSUE #18478 REPRODUCED: prepareCall input and return types omit reasoning',
    );
    process.exitCode = 1;
    return;
  }

  if (result.status === 0) {
    console.log('Issue #18478 was not reproduced.');
    return;
  }

  console.error(output.trim());
  throw new Error('Unexpected TypeScript diagnostics while reproducing #18478');
}

main();

void reproduceTypeErrors;
