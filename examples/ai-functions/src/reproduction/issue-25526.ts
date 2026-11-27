import 'dotenv/config';
import assert from 'node:assert/strict';
import type {
  HarnessV1QuestionsToolInput,
  HarnessV1QuestionsToolOutput,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

async function main() {
  const agent = new HarnessAgent({ harness: createClaudeCode() });
  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: 'node24',
    ports: [4000],
    timeout: 120_000,
    template: await agent.getSandboxTemplate(),
  });
  let session = await agent.createSession({ sandboxSession });
  try {
    const first = await agent.stream({
      session,
      prompt:
        'Call AskUserQuestion now with exactly one question "Which features?", header "Features", multiSelect true, and options Auth (Authentication) and Billing (Payments). After the user answers, quote the complete tool result verbatim, including every selected label and any notes. Do not infer choices or make changes.',
    });
    const calls = await first.toolCalls;
    const call = calls.find(value => value.toolName === 'askUserQuestions');
    assert.ok(call, 'Setup failed: Claude did not ask a question');
    const input = call.input as HarnessV1QuestionsToolInput;
    const question = input.questions[0];
    assert.ok(question?.options && question.options.length >= 2);
    assert.equal(question.allowMultiple, true);
    const options = question.options.slice(0, 2);
    const output: HarnessV1QuestionsToolOutput = {
      action: 'answered',
      answers: {
        [question.id]: {
          optionIds: options.map(option => option.id),
          freeform: 'only for the admin page',
        },
      },
    };
    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();
    const pending = continueFrom.pendingToolResults?.find(
      value => value.toolCallId === call.toolCallId,
    );
    assert.ok(pending, 'Setup failed: no pending question');
    session = await agent.createSession({
      sandboxSession,
      sessionId,
      continueFrom,
    });
    const continued = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: 'askUserQuestions',
          output: { type: 'json', value: output },
          providerOptions: pending.providerOptions,
        },
      ],
    });
    const text = await continued.text;
    console.log(
      JSON.stringify({ nativeRequest: call.providerMetadata, output, text }),
    );
    // Inspect the quoted tool answer, not surrounding prose that can mention
    // the labels merely to say they were not selected.
    const receivedAnswer = text.match(/"Which features\?"="([^"]*)"/)?.[1];
    assert.ok(
      receivedAnswer != null &&
        options.every(option => receivedAnswer.includes(option.label)) &&
        text.includes('only for the admin page'),
      'ISSUE_25526: Claude received the note without all selected option labels',
    );
  } finally {
    await session.destroy();
    await sandboxSession.destroy();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
