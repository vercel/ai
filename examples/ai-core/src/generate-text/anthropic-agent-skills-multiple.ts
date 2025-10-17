import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    prompt:
      'Create a quarterly business report. ' +
      'Include: 1) A Word document with executive summary, ' +
      '2) A PowerPoint presentation with key metrics visualizations, ' +
      '3) An Excel spreadsheet with detailed financial data. ' +
      'Use sample data for Q4 2024.',
    providerOptions: {
      anthropic: {
        skills: [
          { type: 'anthropic', skill_id: 'docx' },
          { type: 'anthropic', skill_id: 'pptx' },
          { type: 'anthropic', skill_id: 'xlsx' },
        ],
      },
    },
  });

  console.dir(result.content, { depth: Infinity });
});
