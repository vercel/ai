---
title: defaultInstructionsMiddleware
description: Middleware that applies default instructions to language model calls
---

# `defaultInstructionsMiddleware()`

`defaultInstructionsMiddleware` applies default instructions to language model
calls that do not already contain a system message. This is useful for
configuring reusable model behavior while allowing call-level `instructions` to
take precedence.

## Import

<Snippet
  text={`import { defaultInstructionsMiddleware } from "ai"`}
  prompt={false}
/>

## API Signature

```ts
function defaultInstructionsMiddleware(options: {
  instructions: Instructions;
}): LanguageModelMiddleware;
```

### Parameters

<PropertiesTable
  content={[
    {
      name: 'instructions',
      type: 'string | SystemModelMessage | Array<SystemModelMessage>',
      isOptional: false,
      description:
        'Default instructions to prepend when a call does not already contain a system message.',
    },
  ]}
/>

### Returns

Returns a
[LanguageModelMiddleware](/docs/ai-sdk-core/middleware) that:

- Prepends the configured instructions to calls without a system message.
- Preserves instruction-level `providerOptions`.
- Leaves calls containing any system message unchanged, so call-level
  instructions take precedence.
- Applies to both non-streaming and streaming language model calls.

## Usage Example

```ts
import {
  defaultInstructionsMiddleware,
  generateText,
  wrapLanguageModel,
} from 'ai';

const model = wrapLanguageModel({
  model: __MODEL__,
  middleware: defaultInstructionsMiddleware({
    instructions: 'You are a concise technical assistant.',
  }),
});

const defaultResult = await generateText({
  model,
  prompt: 'Explain HTTP caching.',
});

const overriddenResult = await generateText({
  model,
  instructions: 'Explain concepts for a complete beginner.',
  prompt: 'Explain HTTP caching.',
});
```

You can attach provider options to default instructions by using a
`SystemModelMessage`:

```ts
const model = wrapLanguageModel({
  model: __MODEL__,
  middleware: defaultInstructionsMiddleware({
    instructions: {
      role: 'system',
      content: 'You are a concise technical assistant.',
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    },
  }),
});
```

<Note>
  This middleware provides defaults, not enforced instructions. Any system
  message in the normalized prompt suppresses the defaults. Only use
  `allowSystemInMessages` with trusted message histories, because an untrusted
  system message could override the configured defaults.
</Note>
