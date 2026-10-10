import assert from 'node:assert/strict';
import { createOpenAI } from '@ai-sdk/openai';

const citation = {
  type: 'url_citation' as const,
  start_index: 0,
  end_index: 7,
  url: 'https://example.com',
  title: 'Example',
};

const responseBody = {
  id: 'resp_1',
  model: 'gpt-5.6',
  created_at: 1_700_000_000,
  output: [
    {
      type: 'message',
      role: 'assistant',
      id: 'msg_1',
      phase: null,
      content: [
        {
          type: 'output_text',
          text: 'Example',
          logprobs: null,
          annotations: [citation],
        },
      ],
    },
  ],
  incomplete_details: null,
  reasoning: null,
  service_tier: 'default',
  usage: { input_tokens: 1, output_tokens: 1 },
};

async function main() {
  const provider = createOpenAI({
    apiKey: 'synthetic',
    fetch: async url => {
      const requestUrl = String(url);

      if (requestUrl.endsWith('/batches/batch_1')) {
        return Response.json({
          id: 'batch_1',
          status: 'completed',
          output_file_id: 'file_1',
          error_file_id: null,
        });
      }

      if (requestUrl.endsWith('/files/file_1/content')) {
        return new Response(
          `${JSON.stringify({
            custom_id: 'request_1',
            response: { status_code: 200, body: responseBody },
            error: null,
          })}\n`,
          { headers: { 'content-type': 'application/jsonl' } },
        );
      }

      return Response.json(responseBody);
    },
  });

  const direct = await provider('gpt-5.6').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Example?' }],
      },
    ],
  });
  const batchStream = await provider
    .experimental_batch()
    .doGetBatchResults({ batchId: 'batch_1' });
  const batchResults = [];

  for await (const result of batchStream) {
    batchResults.push(result);
  }

  const directText = direct.content.find(part => part.type === 'text');
  const batchResult = batchResults[0];
  const batchText =
    batchResult?.type === 'text' && batchResult.status === 'succeeded'
      ? batchResult.result.content.find(part => part.type === 'text')
      : undefined;

  assert.ok(directText?.type === 'text');
  assert.ok(batchText?.type === 'text');
  assert.deepEqual(directText.providerMetadata?.openai?.annotations, [
    citation,
  ]);
  assert.equal(directText.citations?.length, 1);
  assert.equal(directText.citations[0].source.sourceType, 'url');
  assert.equal(directText.citations[0].source.url, citation.url);
  assert.equal(directText.citations[0].startIndex, citation.start_index);
  assert.equal(directText.citations[0].endIndex, citation.end_index);

  const annotationsPreserved =
    JSON.stringify(batchText.providerMetadata?.openai?.annotations) ===
    JSON.stringify(directText.providerMetadata.openai.annotations);
  const citationsPreserved =
    JSON.stringify(batchText.citations) ===
    JSON.stringify(directText.citations);

  if (!annotationsPreserved || !citationsPreserved) {
    console.error(
      'ISSUE_22616_REPRODUCED: OpenAI batch text discarded citation annotations or normalized citations.',
    );
    console.error(JSON.stringify({ directText, batchText }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'OpenAI batch text preserved citation annotations and normalized citations.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
