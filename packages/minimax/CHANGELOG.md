# @ai-sdk/minimax

## 3.0.5

### Patch Changes

- Updated dependencies [160ccdb]
  - @ai-sdk/provider-utils@5.0.20
  - @ai-sdk/anthropic@4.0.29

## 3.0.4

### Patch Changes

- 79e133c: async APIs for generateVideo (poll, webhook)

  Adds an asynchronous start/status flow to the experimental video model
  interface (`VideoModelV4`): models may now implement `doStart`, `doStatus`,
  and `handleWebhookOption` instead of (or in addition to) `doGenerate`, and
  `experimental_generateVideo` accepts `poll` and `webhook` options to
  orchestrate completion via polling or webhooks. Polling configuration can use
  a custom delay implementation for durable workflow compatibility.

- Updated dependencies [9337ecd]
- Updated dependencies [79e133c]
  - @ai-sdk/anthropic@4.0.28
  - @ai-sdk/provider@4.0.5
  - @ai-sdk/provider-utils@5.0.19

## 3.0.3

### Patch Changes

- 494f1ac: fix(provider/minimax): send a default `16:9` ratio for MiniMax-H3 text-to-video

## 3.0.2

### Patch Changes

- 1d36c72: Add video model support to the MiniMax provider (`minimax.video`) for the MiniMax-H3 model, including text-to-video, first/last-frame, and reference-to-video generation.
- Updated dependencies [5fc7da5]
- Updated dependencies [93b2acd]
  - @ai-sdk/provider-utils@5.0.18
  - @ai-sdk/anthropic@4.0.27

## 3.0.1

### Patch Changes

- Updated dependencies [dc0c28e]
- Updated dependencies [fa95504]
  - @ai-sdk/anthropic@4.0.26
  - @ai-sdk/provider-utils@5.0.17

## 3.0.0

### Major Changes

- 5b5335f: Add MiniMax provider with language model support for the MiniMax-M model series.

### Patch Changes

- Updated dependencies [d8210b6]
- Updated dependencies [b192878]
  - @ai-sdk/provider-utils@5.0.16
  - @ai-sdk/anthropic@4.0.25
