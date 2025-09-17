import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: openai('gpt-5-mini'),
    prompt: 'What is an embedding model according to this document?',
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: ['vs_68caad8bd5d88191ab766cf043d89a18'],
      }),
    },
    providerOptions: {
      openai: {
        // include: ['file_search_call.results'],
      },
    },
    includeRawChunks: true,
  });

  await saveRawChunks({ result, filename: 'openai-file-search-tool' });
});
