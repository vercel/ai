import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

const DENIAL_REASON = 'ACCESS_DENIED_SENTINEL';
const FAILURE_SIGNAL =
  'ISSUE_20263_REPRODUCED: denied programmatic tool call resolved successfully';

async function main() {
  const openai = createOpenAI();
  let executeCalled = false;

  const result = await generateText({
    model: openai('gpt-5.6-terra'),
    prompt: `Use programmatic_tool_calling and run this JavaScript logic exactly once:

let rejected = false;
let value;
try {
  value = await tools.get_secret({});
} catch (error) {
  rejected = true;
  value = error instanceof Error ? error.message : String(error);
}
text(JSON.stringify({ rejected, value, valueType: typeof value }));

Do not call get_secret directly. After the program finishes, briefly report its JSON output.`,
    providerOptions: {
      openai: {
        parallelToolCalls: false,
        store: false,
      },
    },
    stopWhen: isStepCount(10),
    toolApproval: {
      get_secret: {
        type: 'denied',
        reason: DENIAL_REASON,
      },
    },
    tools: {
      get_secret: tool({
        description:
          'Returns a secret. This tool is denied by the application access policy.',
        execute: async () => {
          executeCalled = true;
          return { secret: 'execute should never run' };
        },
        inputSchema: z.object({}),
        outputSchema: z.object({ secret: z.string() }),
        providerOptions: {
          openai: {
            allowedCallers: ['programmatic'],
          },
        },
      }),
      programmatic_tool_calling: openai.tools.programmaticToolCalling(),
    },
  });

  const programResult = result.steps
    .flatMap(step => step.toolResults)
    .find(toolResult => toolResult.toolName === 'programmatic_tool_calling');

  if (
    programResult == null ||
    typeof programResult.output !== 'object' ||
    programResult.output === null ||
    !('result' in programResult.output) ||
    typeof programResult.output.result !== 'string'
  ) {
    throw new Error(
      'The live response did not contain a completed program result.',
    );
  }

  const observation = JSON.parse(programResult.output.result) as {
    rejected?: unknown;
    value?: unknown;
    valueType?: unknown;
  };

  console.log(
    JSON.stringify(
      {
        executeCalled,
        observation,
      },
      null,
      2,
    ),
  );

  if (
    !executeCalled &&
    observation.rejected === false &&
    observation.value === DENIAL_REASON &&
    observation.valueType === 'string'
  ) {
    throw new Error(FAILURE_SIGNAL);
  }

  if (executeCalled) {
    throw new Error(
      'Unexpected result: the denied tool execute callback was invoked.',
    );
  }

  if (observation.rejected !== true) {
    throw new Error(
      'Unexpected result: the denied programmatic tool call did not reject.',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
