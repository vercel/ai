---
title: experimental_listBatches
description: API Reference for experimental_listBatches.
---

# `experimental_listBatches()`

<Note type="warning">
  Batch support is experimental and the API may change in patch releases.
</Note>

Lists a page of asynchronous batches and their latest normalized statuses. For
a complete guide to the batch lifecycle, see [Batch](/docs/ai-sdk-core/batch).

```ts
import { experimental_listBatches as listBatches } from 'ai';

const page = await listBatches({
  provider,
  limit: 20,
  cursor,
});

console.log(page.batches, page.nextCursor);
```

## Import

<Snippet
  text={`import { experimental_listBatches } from "ai"`}
  prompt={false}
/>

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: 'provider',
      type: 'Experimental_BatchProvider',
      isOptional: true,
      description:
        'The provider whose batches should be listed. Defaults to the global provider, or the AI Gateway when no global provider is configured.',
    },
    {
      name: 'limit',
      type: 'number',
      isOptional: true,
      description: 'Maximum number of batches to return in this page.',
    },
    {
      name: 'cursor',
      type: 'string',
      isOptional: true,
      description:
        'Opaque cursor returned as nextCursor by the previous list operation.',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: 'Additional provider-specific options for listing batches.',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description:
        'Maximum number of retries for listing batches. Set to 0 to disable retries. Default: 2.',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: 'An optional abort signal to cancel the request.',
    },
    {
      name: 'timeout',
      type: 'number | { totalMs?: number }',
      isOptional: true,
      description: 'Maximum time allowed for the list request.',
    },
    {
      name: 'headers',
      type: 'Record<string, string | undefined>',
      isOptional: true,
      description: 'Additional HTTP headers for the request.',
    },
  ]}
/>

### Returns

<PropertiesTable
  content={[
    {
      name: 'batches',
      type: 'Array<Experimental_Batch>',
      description:
        'The batches in this page. Each item contains a serializable batch reference and its latest normalized status.',
    },
    {
      name: 'nextCursor',
      type: 'string',
      isOptional: true,
      description:
        'Opaque cursor to pass as cursor to retrieve the next page. Omitted when there are no more batches.',
    },
    {
      name: 'providerMetadata',
      type: 'ProviderMetadata',
      isOptional: true,
      description: 'Provider-specific metadata for the list operation.',
    },
  ]}
/>

Calling this function with a provider that does not support listing batches
throws an `UnsupportedFunctionalityError`.
