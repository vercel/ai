import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

/**
 * Please prepare vector store.
 * whern replicate this prompt , please use examples/ai-core/data/ai.pdf
 */
const vectorStoreIds: Array<string> = ['vs_6934e8d538688191817e1ae4989ff811'];

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    system: 'phase1の報告が完了した後でphase2に着手してください。',
    prompt:
      'phase1:生成aiについてファイル検索します。ファイル検索で得られたファイル名と内容を短く要約してください。\n\nphase2:ウェブ検索でサンフランシスコの天気を調査してください。phase1が完了したら、ただちにphase2を着手し完了させてください。',
    //    prompt: '生成aiについてWeb検索を行った結果から、１つキーワードを選定し、そのキーワードをファイル検索します。ファイル検索で得られたファイル名を要約したレポートを作成してください。',
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: 'low',
      }),
      file_search: openai.tools.fileSearch({
        vectorStoreIds,
      }),
    },
    providerOptions: {
      openai: {
        include: ['file_search_call.results'],
      },
    },
  });

  console.log(JSON.stringify(result.response.body, null, 2));
});
