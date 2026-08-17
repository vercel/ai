import { openai, type OpenAIToolOptions } from '@ai-sdk/openai';
import { generateText, isStepCount, MissingToolResultsError, tool } from 'ai';
import { strict as assert } from 'node:assert';
import { z } from 'zod/v4';

const modelId = 'gpt-5.6-terra';

const hoursOutputSchema: NonNullable<OpenAIToolOptions['outputSchema']> = {
  type: 'object',
  properties: {
    totalHours: { type: 'number' },
  },
  required: ['totalHours'],
  additionalProperties: false,
};

type Mode = 'direct' | 'program';
type Approval = 'not-applicable' | 'user-approval';

async function runCase({ mode, approval }: { mode: Mode; approval: Approval }) {
  const result = await generateText({
    model: openai(modelId),
    prompt:
      mode === 'program'
        ? 'Use a hosted JavaScript program. In that program, call getTotalHours exactly once with {"teamId":"alpha"}, then emit the returned totalHours.'
        : 'Call getTotalHours exactly once with {"teamId":"alpha"}, then report the returned totalHours.',
    tools: {
      ...(mode === 'program'
        ? { program: openai.tools.programmaticToolCalling() }
        : {}),
      getTotalHours: tool({
        description: 'Get the total hours for a team.',
        inputSchema: z.object({ teamId: z.string() }),
        execute: async () => ({ totalHours: 92.5 }),
        providerOptions: {
          openai: {
            allowedCallers: [mode === 'program' ? 'programmatic' : 'direct'],
            outputSchema: hoursOutputSchema,
          } satisfies OpenAIToolOptions,
        },
      }),
    },
    toolApproval: {
      getTotalHours: approval,
    },
    stopWhen: isStepCount(10),
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });

  const approvalRequests = result.content.filter(
    part => part.type === 'tool-approval-request',
  );

  console.log(
    `${mode} approval=${approval} OK steps=${result.steps.length} approvalRequests=${approvalRequests.length} text=${JSON.stringify(result.text)}`,
  );

  return { result, approvalRequests };
}

async function main() {
  const directWithoutApproval = await runCase({
    mode: 'direct',
    approval: 'not-applicable',
  });
  assert.equal(directWithoutApproval.approvalRequests.length, 0);
  assert.ok(directWithoutApproval.result.steps.length >= 2);

  const directWithApproval = await runCase({
    mode: 'direct',
    approval: 'user-approval',
  });
  assert.equal(directWithApproval.result.steps.length, 1);
  assert.equal(directWithApproval.approvalRequests.length, 1);

  const programWithoutApproval = await runCase({
    mode: 'program',
    approval: 'not-applicable',
  });
  assert.equal(programWithoutApproval.approvalRequests.length, 0);
  assert.ok(programWithoutApproval.result.steps.length >= 2);

  try {
    const programWithApproval = await runCase({
      mode: 'program',
      approval: 'user-approval',
    });

    assert.equal(programWithApproval.result.steps.length, 1);
    assert.equal(programWithApproval.approvalRequests.length, 1);
  } catch (error) {
    if (MissingToolResultsError.isInstance(error)) {
      console.error(
        'ISSUE_18970_REPRODUCED: programmatic approval threw AI_MissingToolResultsError instead of returning a tool-approval-request',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
