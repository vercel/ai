import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

const FAILURE_SIGNAL =
  'ISSUE_18134_REPRODUCED: follow-up rejected because shell_call_output has no matching shell_call';

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${describeError(error.cause)}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function main() {
  const shell = openai.tools.shell({
    environment: {
      type: 'containerAuto',
      memoryLimit: '1g',
      networkPolicy: { type: 'disabled' },
    },
  });

  const firstTurn = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: { shell },
    prompt: 'Run `printf issue-18134` using the shell tool.',
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });

  const followUp = streamText({
    model: openai.responses('gpt-5.2'),
    tools: { shell },
    messages: [
      {
        role: 'user',
        content: 'Run `printf issue-18134` using the shell tool.',
      },
      ...firstTurn.responseMessages,
      { role: 'user', content: 'What did the command print?' },
    ],
    providerOptions: {
      openai: {
        store: false,
      },
    },
  });

  let text = '';

  for await (const part of followUp.fullStream) {
    if (part.type === 'text-delta') {
      text += part.text;
    }

    if (part.type === 'error') {
      const details = describeError(part.error);

      if (
        details.includes(
          'No tool call found for shell call output with call_id',
        )
      ) {
        console.error(FAILURE_SIGNAL);
        process.exitCode = 1;
        return;
      }

      throw part.error;
    }
  }

  console.log(`Follow-up succeeded: ${text}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
