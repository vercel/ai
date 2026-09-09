import { openai } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const denialReason = 'ACCESS_DENIED_SENTINEL';

run(async () => {
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
        reason: denialReason,
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
    throw new Error('The model did not produce the expected program result.');
  }

  const observation = await parseJSON({ text: programResult.output.result });

  console.log('Tool execute callback called:', executeCalled);
  console.log('Program observed:', observation);
  console.log('Final model response:', result.text);

  if (
    executeCalled === false &&
    typeof observation === 'object' &&
    observation !== null &&
    'rejected' in observation &&
    observation.rejected === false &&
    'value' in observation &&
    observation.value === denialReason &&
    'valueType' in observation &&
    observation.valueType === 'string'
  ) {
    console.log(
      '\nBUG REPRODUCED: a denied program-owned tool call resolved as a string.',
    );
  } else {
    console.log(
      '\nBug not reproduced: the denied call did not resolve with the denial string.',
    );
  }
});
