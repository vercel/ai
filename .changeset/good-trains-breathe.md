---
'@ai-sdk/google': patch
---

embed() now uses the single embeddings endpoint
No code updates are needed.

This is to make sure that users are not ratelimited when using the batch endpoint, since many models have different limits for batch and single embeddings.

Eg: Google has a limit of 150 RPM for batch requests, and 1500 RPM for single requests.

Before, AI SDK would always use the batch endpoint, even for embed() calls, which led to ratelimits.

This does not have any breaking functionality and is fully tested :)
if (values.length > 1) {
const batchResult = await this.doEmbedBatch({
values,
options,
});
return batchResult;
}
