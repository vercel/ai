---
title: AI_StreamProviderError
description: Learn how to handle AI_StreamProviderError
---

# AI_StreamProviderError

This error represents a well-formed error event reported by a provider after a
model response stream has started. The AI SDK exposes it in streaming error
parts and callbacks such as the `streamText` `onError` callback.

## Properties

- `message`: The provider error message
- `type`: The provider-defined error type (optional)
- `code`: The provider-defined error code as a string or number (optional)
- `statusCode`: The HTTP-equivalent status code when supplied by or inferable from provider metadata (optional)
- `isRetryable`: Whether retrying the model call may succeed
- `data`: The original provider error payload (optional)
- `cause`: The underlying error that caused the failure (optional)

`isRetryable` is a retry classification, not an automatic retry. A stream may
already contain partial output, so applications should decide whether to
discard, replace, or preserve that output before starting another model call.

## Checking for this Error

Use `StreamProviderError.isInstance` so identification also works when multiple
AI SDK versions are present:

```typescript
import { StreamProviderError, streamText } from 'ai';

const result = streamText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  onError: ({ error }) => {
    if (StreamProviderError.isInstance(error) && error.isRetryable) {
      // Schedule an application-managed retry.
    }
  },
});
```

Providers may not include enough metadata to determine a status code. In that
case, `statusCode` is `undefined`, and retryability is classified
conservatively. Provider-specific status and retry mappings are supplied by the
provider adapter rather than inferred from arbitrary provider error type or code
substrings. Provider `type` and `code` values are preserved independently, even
when a numeric code is also used to determine `statusCode`. Errors that are
already `Error` instances and malformed or unknown provider values are
preserved unchanged.
