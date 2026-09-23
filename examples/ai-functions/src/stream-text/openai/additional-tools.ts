import { streamText, type ModelMessage } from 'ai';
import { options, project } from '../../lib/openai-additional-tools';
import { run } from '../../lib/run';

run(async () => {
  const messages: ModelMessage[] = [
    { role: 'user', content: 'Read the skill, then get the example number.' },
  ];
  const first = streamText({ ...options, messages });
  for await (const text of first.textStream) process.stdout.write(text);
  const saved: ModelMessage[] = JSON.parse(
    JSON.stringify(project([...messages, ...(await first.responseMessages)])),
  );
  const second = streamText({
    ...options,
    messages: [
      ...saved,
      { role: 'user', content: 'Get the example number again.' },
    ],
  });
  for await (const text of second.textStream) process.stdout.write(text);
});
