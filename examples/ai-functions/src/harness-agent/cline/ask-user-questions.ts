import type {
  HarnessV1QuestionsToolInput,
  HarnessV1QuestionsToolOutput,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCline } from './_create';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const agent = new HarnessAgent({
    harness: createCline(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
  });
  let session = await agent.createSession();

  try {
    const first = await agent.stream({
      session,
      prompt:
        'Use your built-in question tool to ask which framework I prefer. Offer React and Vue. Do not continue until I answer.',
    });
    await printFullStream({ result: first });

    const toolCall = (await first.toolCalls).find(
      toolCall => toolCall.toolName === 'askUserQuestions',
    );
    if (toolCall == null) {
      throw new Error('Expected an askUserQuestions tool call.');
    }
    const input = toolCall.input as HarnessV1QuestionsToolInput;
    const question = input.questions[0];
    const option = question.options?.[0];
    if (question == null || option == null) {
      throw new Error('Expected a question with at least one option.');
    }

    const output: HarnessV1QuestionsToolOutput = {
      action: 'answered',
      answers: {
        [question.id]: { optionIds: [option.id] },
      },
    };
    const sessionId = session.sessionId;
    const continueFrom = await session.suspendTurn();
    const pendingResult = continueFrom.pendingToolResults?.find(
      result => result.toolCallId === toolCall.toolCallId,
    );
    if (pendingResult == null) {
      throw new Error('Expected serialized pending question state.');
    }

    session = await agent.createSession({ sessionId, continueFrom });
    const continued = await agent.continueStream({
      session,
      toolResultContinuations: [
        {
          type: 'tool-result',
          toolCallId: toolCall.toolCallId,
          toolName: 'askUserQuestions',
          output: { type: 'json', value: output },
          providerOptions: pendingResult.providerOptions,
        },
      ],
    });
    await printFullStream({ result: continued });
  } finally {
    await session.destroy();
  }
});
