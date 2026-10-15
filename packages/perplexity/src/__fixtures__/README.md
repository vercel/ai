# Agent API fixtures

`agent-web-search.json` and `agent-web-search.chunks.txt` were captured from the
live Perplexity Agent API on September 25, 2026 with the `fast` preset and a
1024-token output limit. The prompt was:

> Find the official TypeScript website and describe TypeScript in one sentence with a citation.

The JSON response is unchanged. The stream contains one raw JSON event per line;
the tests reconstruct the SSE envelope. Authentication headers are not recorded.

The account used for capture has zero data retention and rejects `finance_search`
with HTTP 400. Finance coverage therefore uses the documented `finance_results`
shape in unit tests. The generation and streaming `finance-search.ts` examples
can capture live finance responses with an account that supports that tool.

`agent-image-search.json` and `agent-image-search.chunks.txt` were captured
from the live Perplexity Agent API on October 15, 2026 with the direct
`openai/gpt-6-luna` model, a 1024-token output limit, `store: false`, and one
`image_search` tool limited to three results. They use the same format as the
web search fixtures. The prompt was:

> Find two photos of the Golden Gate Bridge and say in one sentence what each shows.
