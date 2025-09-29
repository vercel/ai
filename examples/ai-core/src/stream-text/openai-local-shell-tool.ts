import { openai } from '@ai-sdk/openai';
import { stepCountIs, streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: openai.responses('gpt-5-codex'),
    tools: {
      local_shell: openai.tools.localShell({
        execute: async ({ action }) => {
          console.log('ACTION');
          console.dir(action, { depth: Infinity });

          const stdout = `
❯ ls
README.md     build         data          node_modules  package.json  src           tsconfig.json
          `;

          return { output: stdout };
        },
      }),
    },
    prompt: 'List the files in my home directory.',
    stopWhen: stepCountIs(2),
    includeRawChunks: true,
  });

  await saveRawChunks({ result, filename: 'openai-local-shell-tool' });
});
