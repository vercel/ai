---
'ai': patch
---

chore(ai): remove runtime validation of inputs that TypeScript types already guarantee

`streamText`, `generateText`, `generateObject` and `streamObject` no longer validate messages against the `ModelMessage` schema. This removes a cost that grew linearly with message history and was paid on every `streamText` step. Type checks on call settings, steering messages, tool caller configuration, `smoothStream` chunking, `experimental_streamSpeech` text input, the shape of `decide` state and questions, and the batch reference version have also been removed. Value constraints that types cannot express, such as integer ranges, non-empty collections, unknown keys, and non-finite numbers or cycles in `decide` JSON input, are still validated.
