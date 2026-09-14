---
title: experimental_getBatchStatus
description: API Reference for experimental_getBatchStatus.
---

# `experimental_getBatchStatus()`

<Note type="warning">
  Batch support is experimental and the API may change in patch releases.
</Note>

Retrieves the latest status of an asynchronous batch. For a complete guide to
the batch lifecycle, see [Batch](/docs/ai-sdk-core/batch).

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { experimental_getBatchStatus as getBatchStatus } from 'ai';

const status = await getBatchStatus({
  provider: anthropic,
  batch,
});

console.log(status.status, status.requestCounts);
```

## Import

<Snippet
  text={`import { experimental_getBatchStatus } from "ai"`}
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
        'The provider used to access the batch. Defaults to the global provider, or the AI Gateway when no global provider is configured.',
    },
    {
      name: 'batch',
      type: 'Experimental_BatchReference',
      description:
        'The serializable reference returned by experimental_startBatch.',
    },
    {
      name: 'providerOptions',
      type: 'ProviderOptions',
      isOptional: true,
      description: 'Additional provider-specific options for status retrieval.',
    },
    {
      name: 'maxRetries',
      type: 'number',
      isOptional: true,
      description:
        'Maximum number of retries for status retrieval. Set to 0 to disable retries. Default: 2.',
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
      description: 'Maximum time allowed for the status request.',
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
      name: 'status',
      type: "'pending' | 'completed' | 'failed'",
      description: 'The latest normalized batch status.',
    },
    {
      name: 'rawStatus',
      type: 'string',
      isOptional: true,
      description: 'The provider-specific batch status, when available.',
    },
    {
      name: 'requestCounts',
      type: '{ total: number; pending: number; completed: number; failed: number }',
      isOptional: true,
      description: 'Provider-reported request counts.',
    },
    {
      name: 'error',
      type: 'Experimental_BatchError',
      isOptional: true,
      description: 'Error details when the batch fails.',
    },
    {
      name: 'createdAt',
      type: 'string',
      isOptional: true,
      description: 'Creation timestamp, when provided by the provider.',
    },
    {
      name: 'expiresAt',
      type: 'string',
      isOptional: true,
      description: 'Expiration timestamp, when provided by the provider.',
    },
    {
      name: 'providerMetadata',
      type: 'ProviderMetadata',
      isOptional: true,
      description: 'Provider-specific metadata for the batch.',
    },
  ]}
/>
