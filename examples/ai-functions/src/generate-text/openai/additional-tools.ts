import { generateText, type ModelMessage } from 'ai';
import { options, project } from '../../lib/openai-additional-tools';
import { run } from '../../lib/run';

run(async () => {
  const messages: ModelMessage[] = [
    { role: 'user', content: 'Read the skill, then get the example number.' },
  ];
  const first = await generateText({ ...options, messages });
  console.log(first.text);
  // Persist all steps, including the original tool-result options.
  const saved: ModelMessage[] = JSON.parse(
    JSON.stringify(project([...messages, ...first.responseMessages])),
  );
  const second = await generateText({
    ...options,
    messages: [
      ...saved,
      { role: 'user', content: 'Get the example number again.' },
    ],
  });
  console.log(second.text);
});
