import assert from 'node:assert/strict';
import { generateText, InvalidToolApprovalSignatureError, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import * as z from 'zod/v4';

const secret = 'issue-17832-reproduction-secret';
const approvalId = 'approval-1';

type ApprovalTuple = {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: { path: string; recursive?: boolean };
};

const usage = {
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
};

function approvalTool(execute: () => Promise<string> = async () => 'ok') {
  return tool({
    inputSchema: z.object({
      path: z.string(),
      recursive: z.boolean().optional(),
    }),
    execute,
  });
}

async function issueSignature(
  tuple: ApprovalTuple,
  inputJson = JSON.stringify(tuple.input),
): Promise<string> {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: tuple.toolCallId,
            toolName: tuple.toolName,
            input: inputJson,
          },
        ],
        finishReason: { unified: 'tool-calls', raw: undefined },
        usage,
        warnings: [],
      }),
    }),
    tools: {
      [tuple.toolName]: approvalTool(),
    },
    toolApproval: {
      [tuple.toolName]: 'user-approval' as const,
    },
    experimental_toolApprovalSecret: secret,
    prompt: 'issue an approval request',
    _internal: {
      generateId: () => tuple.approvalId,
    },
  });

  const request = result.content.find(
    part => part.type === 'tool-approval-request',
  );
  assert.ok(request, 'expected a tool approval request');
  assert.ok(request.signature, 'expected a signed tool approval request');
  return request.signature;
}

async function replayApproval({
  tuple,
  signature,
  execute,
}: {
  tuple: ApprovalTuple;
  signature: string;
  execute: () => Promise<string>;
}): Promise<void> {
  await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'done' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      }),
    }),
    tools: {
      [tuple.toolName]: approvalTool(execute),
    },
    toolApproval: {
      [tuple.toolName]: 'user-approval' as const,
    },
    experimental_toolApprovalSecret: secret,
    messages: [
      { role: 'user', content: 'approve the tool' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: tuple.toolCallId,
            toolName: tuple.toolName,
            input: tuple.input,
          },
          {
            type: 'tool-approval-request',
            approvalId: tuple.approvalId,
            toolCallId: tuple.toolCallId,
            signature,
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: tuple.approvalId,
            approved: true,
          },
        ],
      },
    ],
  });
}

async function assertRejected(
  tuple: ApprovalTuple,
  signature: string,
): Promise<void> {
  let executions = 0;

  await assert.rejects(
    replayApproval({
      tuple,
      signature,
      execute: async () => {
        executions++;
        return 'executed';
      },
    }),
    error => InvalidToolApprovalSignatureError.isInstance(error),
  );

  assert.equal(executions, 0, 'the differently bound tool must not execute');
}

function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJSON(record[key])}`)
    .join(',')}}`;
}

function toBase64url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function signLegacy(tuple: ApprovalTuple): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonicalJSON(tuple.input)),
  );
  const inputDigest = toBase64url(new Uint8Array(digest));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const payload = encoder.encode(
    `${tuple.approvalId}\n${tuple.toolCallId}\n${tuple.toolName}\n${inputDigest}`,
  );
  return toBase64url(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, payload)),
  );
}

async function main() {
  const signed = {
    approvalId,
    toolCallId: 'call-1',
    toolName: 'searchDocs\ndeleteFile',
    input: { path: '/tmp/target' },
  };
  const retupled = {
    approvalId,
    toolCallId: 'call-1\nsearchDocs',
    toolName: 'deleteFile',
    input: { path: '/tmp/target' },
  };

  const signature = await issueSignature(signed);
  const retupledSignature = await issueSignature(retupled);
  assert.notEqual(
    signature,
    retupledSignature,
    'distinct approval tuples must have distinct signatures',
  );
  await assertRejected(retupled, signature);

  let validExecutions = 0;
  await replayApproval({
    tuple: signed,
    signature,
    execute: async () => {
      validExecutions++;
      return 'executed';
    },
  });
  assert.equal(validExecutions, 1, 'an exact signature must remain valid');

  for (const delimiter of ['\n', '\r', '\t', '\0', '"', '\\']) {
    const withDelimiter = {
      approvalId,
      toolCallId: 'call-1',
      toolName: `alpha${delimiter}beta`,
      input: { path: '/tmp/target' },
    };
    const shiftedDelimiter = {
      approvalId,
      toolCallId: `call-1${delimiter}alpha`,
      toolName: 'beta',
      input: { path: '/tmp/target' },
    };
    await assertRejected(shiftedDelimiter, await issueSignature(withDelimiter));

    const delimiterInToolCallId = {
      approvalId,
      toolCallId: `alpha${delimiter}beta`,
      toolName: 'deleteFile',
      input: { path: '/tmp/target' },
    };
    const shiftedIntoApprovalId = {
      approvalId: `${approvalId}${delimiter}alpha`,
      toolCallId: 'beta',
      toolName: 'deleteFile',
      input: { path: '/tmp/target' },
    };
    await assertRejected(
      shiftedIntoApprovalId,
      await issueSignature(delimiterInToolCallId),
    );
  }

  const canonicalTuple = {
    approvalId,
    toolCallId: 'canonical-call',
    toolName: 'canonicalTool',
    input: { path: '/tmp/target', recursive: true },
  };
  assert.equal(
    await issueSignature(
      canonicalTuple,
      '{"path":"/tmp/target","recursive":true}',
    ),
    await issueSignature(
      canonicalTuple,
      '{"recursive":true,"path":"/tmp/target"}',
    ),
    'equivalent inputs with different key order must have the same signature',
  );
  await assertRejected(
    {
      ...canonicalTuple,
      input: { path: '/tmp/different-target', recursive: true },
    },
    await issueSignature(canonicalTuple),
  );

  const legacySafe = {
    approvalId,
    toolCallId: 'legacy-call',
    toolName: 'legacyTool',
    input: { path: '/tmp/target' },
  };
  let legacyExecutions = 0;
  await replayApproval({
    tuple: legacySafe,
    signature: await signLegacy(legacySafe),
    execute: async () => {
      legacyExecutions++;
      return 'executed';
    },
  });
  assert.equal(
    legacyExecutions,
    1,
    'newline-free legacy signatures must remain valid',
  );

  const legacyNewlineSignature = await signLegacy(signed);
  await assertRejected(signed, legacyNewlineSignature);
  await assertRejected(retupled, legacyNewlineSignature);

  console.log(
    'Issue #17832 could not be reproduced: signatures remained bound to the exact approval tuple.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
