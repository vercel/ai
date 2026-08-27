import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  jsonSchema,
  tool,
  ToolLoopAgent,
  type LanguageModel,
  type ToolLoopAgentSettings,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

function expectedPublicTypes(model: LanguageModel) {
  const settings: ToolLoopAgentSettings = {
    model,
    experimental_toolApprovalSecret: 'constructor-secret',
  };

  type PrepareCall = NonNullable<ToolLoopAgentSettings['prepareCall']>;
  type PrepareCallInput = Parameters<PrepareCall>[0];
  type PrepareCallOutput = Awaited<ReturnType<PrepareCall>>;

  const readPrepareCallInput = (
    input: PrepareCallInput,
  ): string | Uint8Array | undefined => input.experimental_toolApprovalSecret;

  const prepareCallOutput: PrepareCallOutput = {
    model,
    prompt: 'test',
    experimental_toolApprovalSecret: new Uint8Array([1, 2, 3]),
  };

  return { prepareCallOutput, readPrepareCallInput, settings };
}

async function verifyRuntimeSupport() {
  const secret = 'test-hmac-secret-do-not-use-in-production';
  const sensitiveTool = tool({
    inputSchema: jsonSchema<{ value: string }>({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
    needsApproval: true,
  });

  const agent = new ToolLoopAgent({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: 'call-1',
            toolName: 'sensitive',
            input: '{"value":"test"}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
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
      }),
    }),
    tools: { sensitive: sensitiveTool },
    experimental_toolApprovalSecret: secret,
  } as any);

  const result = await agent.generate({ prompt: 'Run the sensitive tool.' });
  const approvalRequest = result.content.find(
    part => part.type === 'tool-approval-request',
  );

  assert.equal(approvalRequest?.type, 'tool-approval-request');
  const signature = approvalRequest?.signature;
  if (typeof signature !== 'string') {
    throw new Error('Runtime did not honor experimental_toolApprovalSecret.');
  }
  assert.ok(signature.length > 0);
}

async function main() {
  await verifyRuntimeSupport();

  const typeCheck = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'tsc',
      '--noEmit',
      '--pretty',
      'false',
      '--skipLibCheck',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      process.argv[1],
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  const compilerOutput = `${typeCheck.stdout}${typeCheck.stderr}`;
  const approvalSecretDiagnostics = compilerOutput
    .split('\n')
    .filter(
      line =>
        line.includes('error TS') &&
        line.includes('experimental_toolApprovalSecret'),
    );

  if (approvalSecretDiagnostics.length > 0) {
    console.error(
      'ISSUE #19874 REPRODUCED: ToolLoopAgent approval-secret types are missing.',
    );
    console.error(compilerOutput.trim());
    process.exit(1);
  }

  assert.equal(
    typeCheck.status,
    0,
    `TypeScript failed for an unrelated reason:\n${compilerOutput}`,
  );

  console.log(
    'ToolLoopAgent accepts experimental_toolApprovalSecret in its settings and prepareCall types.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
