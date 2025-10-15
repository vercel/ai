import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, generateText } from 'ai';
import { run } from '../lib/run';
import { anthropicLocalFsMemoryTool } from '../lib/anthropic-local-fs-memory-tool';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: `Please remember these [MEM] facts for future turns.
Acknowledge by saying "stored".
[MEM] Name: Alex Rivera
[MEM] Role: PM at Nova Robotics`,
    tools: {
      memory: anthropicLocalFsMemoryTool({ basePath: './memory' }),
    },
    stopWhen: stepCountIs(10),
  });

  console.log(JSON.stringify(result.steps[0].response.body));
});
