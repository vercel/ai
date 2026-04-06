import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { generateText, uploadSkill } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../lib/run';

run(async () => {
  const skillSource = readFileSync('data/island-rescue/SKILL.md');

  const [openaiUpload, anthropicUpload] = await Promise.all([
    uploadSkill({
      api: openai.skills(),
      files: [
        {
          path: 'island-rescue/SKILL.md',
          content: skillSource,
        },
      ],
    }),
    uploadSkill({
      api: anthropic.skills(),
      files: [
        {
          path: 'island-rescue/SKILL.md',
          content: skillSource,
        },
      ],
      displayTitle: 'Island Rescue',
    }),
  ]);

  const mergedReference = {
    ...openaiUpload.providerReference,
    ...anthropicUpload.providerReference,
  };

  console.log('Merged provider reference:', mergedReference);

  const messages = [
    {
      role: 'user' as const,
      content:
        'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
    },
  ];

  console.log('\n--- OpenAI Response ---');
  const openaiResult = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: {
      shell: openai.tools.shell({
        environment: {
          type: 'containerAuto',
          skills: [
            {
              type: 'skillReference',
              providerReference: mergedReference,
            },
          ],
        },
      }),
    },
    messages,
  });
  console.log(openaiResult.text);

  console.log('\n--- Anthropic Response ---');
  const anthropicResult = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    messages,
    providerOptions: {
      anthropic: {
        container: {
          skills: [
            {
              type: 'custom',
              providerReference: mergedReference,
            },
          ],
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });
  console.log(anthropicResult.text);
});
