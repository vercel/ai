import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const datastore = process.env.GOOGLE_VERTEX_AI_SEARCH_DATASTORE;

  if (datastore == null) {
    throw new Error('GOOGLE_VERTEX_AI_SEARCH_DATASTORE is not set');
  }

  const { text, sources } = await generateText({
    model: googleVertex('gemini-2.5-flash'),
    tools: {
      vertex_ai_search: googleVertex.tools.vertexAiSearch({ datastore }),
    },
    prompt: 'Summarize the most relevant information about our return policy.',
  });

  console.log(text);
  console.log(sources);
});
