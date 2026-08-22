import type {
  HarnessV1,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { SessionManager } from '../../../../packages/harness-pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js';
import { createPiSession } from '../../../../packages/harness-pi/src/pi-session';
import { runPrompt } from '../../../../packages/harness/src/agent/internal/run-prompt';

const toolCalls = [
  {
    toolCallId: 'call_1',
    toolName: 'createSuite',
    input: JSON.stringify({ name: 'A' }),
  },
  {
    toolCallId: 'call_2',
    toolName: 'createSuite',
    input: JSON.stringify({ name: 'B' }),
  },
] as const;

function createScriptedSession(): HarnessV1Session {
  const events = [
    ...toolCalls.map(toolCall => ({
      type: 'tool-call',
      ...toolCall,
      // This is the proposed count signal from the issue. Current main ignores
      // it; a count-based fix can use it to batch the two approval requests.
      stepToolCallCount: toolCalls.length,
    })),
    // This is the alternative end-marker shape discussed in the issue. Current
    // main returns before reading it; an end-marker fix can batch on it.
    { type: 'tool-calls-end' },
  ] as unknown as HarnessV1StreamPart[];

  const emitEvents = (
    emit: (event: HarnessV1StreamPart) => void,
  ): HarnessV1PromptControl => {
    queueMicrotask(() => {
      for (const event of events) {
        emit(event);
      }
    });
    return {
      done: Promise.resolve(),
      submitToolResult: async () => {},
    };
  };

  return {
    sessionId: 'issue-19302-scripted-session',
    isResume: false,
    doPromptTurn: async options => emitEvents(options.emit),
    doContinueTurn: async options => emitEvents(options.emit),
    doCompact: async () => {},
    doDetach: async () => ({
      type: 'resume-session',
      harnessId: 'scripted',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doStop: async () => ({
      type: 'resume-session',
      harnessId: 'scripted',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    doDestroy: async () => {},
    doSuspendTurn: async () => ({
      type: 'continue-turn',
      harnessId: 'scripted',
      specificationVersion: 'harness-v1',
      data: {},
    }),
  };
}

function createSandboxSession(
  journalFileName: string,
  journalBytes: Uint8Array,
): Experimental_SandboxSession {
  const sandbox = {
    defaultWorkingDirectory: '/sandbox',
    run: async ({ command }: { command: string }) => ({
      stdout: command === 'printf "%s" "$HOME"' ? '/sandbox/home' : '',
      stderr: '',
      exitCode: 0,
    }),
    readBinaryFile: async ({ path: filePath }: { path: string }) =>
      filePath.endsWith(`/${journalFileName}`) ? journalBytes : undefined,
    writeBinaryFile: async () => {},
    writeTextFile: async () => {},
  };
  return sandbox as unknown as Experimental_SandboxSession;
}

async function collectApprovalToolCallIds(): Promise<string[]> {
  const createSuite = tool({
    description: 'Create a suite.',
    inputSchema: z.object({ name: z.string() }),
    execute: async ({ name }) => ({ name }),
  });
  const harness: HarnessV1 = {
    specificationVersion: 'harness-v1',
    harnessId: 'scripted',
    builtinTools: {},
    doStart: async () => createScriptedSession(),
  };
  const { result, done } = runPrompt({
    harness,
    session: createScriptedSession(),
    prompt: 'Create two suites.',
    instructions: undefined,
    tools: { createSuite },
    toolSpecs: [],
    toolApproval: { createSuite: 'user-approval' },
    sandboxSession: {} as Experimental_SandboxSession,
    sessionWorkDir: '/sandbox/work',
    runtimeContext: {},
    abortSignal: undefined,
  });

  const approvalToolCallIds: string[] = [];
  for await (const part of result.fullStream) {
    if (part.type === 'tool-approval-request') {
      approvalToolCallIds.push(part.toolCall.toolCallId);
    }
  }
  await done;
  return approvalToolCallIds;
}

async function piTurnRemainsPendingAfterOnlyAvailableApproval(
  approvalToolCallId: string,
): Promise<boolean> {
  const cwd = mkdtempSync(path.join(tmpdir(), 'issue-19302-pi-cwd-'));
  const sessionDir = mkdtempSync(
    path.join(tmpdir(), 'issue-19302-pi-session-'),
  );
  const journal = SessionManager.create(cwd, sessionDir);
  journal.appendMessage({
    role: 'user',
    content: 'Create two suites.',
    timestamp: Date.now(),
  });
  journal.appendMessage({
    role: 'assistant',
    content: toolCalls.map(toolCall => ({
      type: 'toolCall',
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      arguments: JSON.parse(toolCall.input),
    })),
    stopReason: 'toolUse',
    timestamp: Date.now(),
  } as unknown as Parameters<typeof journal.appendMessage>[0]);
  const journalFile = journal.getSessionFile();
  if (journalFile == null) {
    throw new Error('Pi did not create a session journal.');
  }
  const journalFileName = path.basename(journalFile);
  const sandboxSession = createSandboxSession(
    journalFileName,
    readFileSync(journalFile),
  );
  const session = await createPiSession({
    sessionId: 'issue-19302-pi-resume',
    sandboxSession,
    sessionWorkDir: '/sandbox/work',
    skills: [],
    settings: {},
    clientApp: 'ai-sdk/harness-pi/issue-19302-reproduction',
    isResume: true,
    resumeSessionFileName: journalFileName,
  });
  const control = await session.doContinueTurn({
    tools: [{ name: 'createSuite' }],
    emit: () => {},
  });

  try {
    await control.submitToolResult({
      toolCallId: approvalToolCallId,
      output: { created: true },
    });
    return await Promise.race([
      control.done.then(() => false),
      new Promise<true>(resolve => setTimeout(() => resolve(true), 200)),
    ]);
  } finally {
    await session.doSuspendTurn();
    await control.done;
  }
}

async function main(): Promise<void> {
  const approvalToolCallIds = await collectApprovalToolCallIds();
  if (approvalToolCallIds.length === toolCalls.length) {
    console.log(
      'Both approval requests were surfaced; no deadlock reproduced.',
    );
    return;
  }
  if (
    approvalToolCallIds.length !== 1 ||
    approvalToolCallIds[0] !== toolCalls[0].toolCallId
  ) {
    throw new Error(
      `Unexpected approval requests: ${JSON.stringify(approvalToolCallIds)}`,
    );
  }

  const remainedPending = await piTurnRemainsPendingAfterOnlyAvailableApproval(
    approvalToolCallIds[0],
  );
  if (!remainedPending) {
    throw new Error(
      'The resumed Pi turn settled after receiving only one of two tool results.',
    );
  }

  console.error(
    'ISSUE #19302 REPRODUCED: only 1 of 2 approval requests was surfaced and the resumed Pi turn remained pending after the only available approval.',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error('Reproduction setup failed:', error);
  process.exitCode = 2;
});
