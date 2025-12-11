import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

/**
 * Please prepare vector store.
 * whern replicate this prompt , please use examples/ai-core/data/ai.pdf
 */
const vectorStoreIds: Array<string> = ['vs_6934e8d538688191817e1ae4989ff811'];

run(async () => {
  const result = streamText({
    model: openai('gpt-5-mini'),
    system: 'phase1の報告が完了した後でphase2に着手してください。',
    prompt:
      'phase1:生成aiについてファイル検索します。ファイル検索で得られたファイル名と内容を短く要約してください。\n\nphase2:ウェブ検索でサンフランシスコの天気を調査してください。phase1が完了したら、ただちにphase2を着手し完了させてください。',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'low',
      }),
      file_search: openai.tools.fileSearch({
        vectorStoreIds,
      }),
    },
    includeRawChunks: true,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'raw') {
      console.log(JSON.stringify(part.rawValue));
    }
  }
});
