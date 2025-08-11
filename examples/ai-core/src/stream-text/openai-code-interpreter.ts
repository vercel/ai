import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai.responses('gpt-5'),
    stopWhen: stepCountIs(5),
    tools: {
      code_interpreter: openai.tools.codeInterpreter({}),
    },
    prompt:
      'Write and run Python code to simulate rolling two dice 10000 times and show a table of the results.' +
      'The table should have three columns: "Sum", "Count", and "Percentage".',
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

main().catch(console.error);
