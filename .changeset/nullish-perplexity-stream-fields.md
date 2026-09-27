---
'@ai-sdk/perplexity': patch
---

Accept `null` fields in Agent API stream events, such as `contents: null` on `response.reasoning.fetch_url_results` when no URLs were fetched. Previously these events failed validation and errored the stream.
