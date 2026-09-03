# @ai-sdk/minimax

## 3.0.25

### Patch Changes

- Updated dependencies [65397d7]
  - @ai-sdk/anthropic@4.0.49

## 3.0.24

### Patch Changes

- a580ec8: feat(minimax): validate video status polling redirects for MiniMax, Kling AI, and ByteDance
- Updated dependencies [4d25a08]
- Updated dependencies [6bcc0f8]
  - @ai-sdk/anthropic@4.0.48
  - @ai-sdk/provider-utils@5.0.36

## 3.0.23

### Patch Changes

- Updated dependencies [5190b67]
  - @ai-sdk/provider@4.0.10
  - @ai-sdk/provider-utils@5.0.35
  - @ai-sdk/anthropic@4.0.47

## 3.0.22

### Patch Changes

- 5366b7b: Add model-aware MiniMax 480P and 768P video resolutions, duration limits, and reference-input validation.
- 5366b7b: Map MiniMax 480P and 768P frame sizes onto their named video resolution tiers, so a typed top-level `resolution` can reach them.
- Updated dependencies [aa45741]
  - @ai-sdk/anthropic@4.0.46
  - @ai-sdk/provider@4.0.9
  - @ai-sdk/provider-utils@5.0.34

## 3.0.21

### Patch Changes

- Updated dependencies [90192f1]
  - @ai-sdk/provider-utils@5.0.33
  - @ai-sdk/anthropic@4.0.45

## 3.0.20

### Patch Changes

- Updated dependencies [3e125ba]
  - @ai-sdk/provider-utils@5.0.32
  - @ai-sdk/anthropic@4.0.44

## 3.0.19

### Patch Changes

- Updated dependencies [7de3612]
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
  - @ai-sdk/anthropic@4.0.43
  - @ai-sdk/provider-utils@5.0.31

## 3.0.18

### Patch Changes

- Updated dependencies [591d25b]
  - @ai-sdk/anthropic@4.0.42
  - @ai-sdk/provider@4.0.8
  - @ai-sdk/provider-utils@5.0.30

## 3.0.17

### Patch Changes

- Updated dependencies [b74971f]
  - @ai-sdk/provider-utils@5.0.29
  - @ai-sdk/anthropic@4.0.41

## 3.0.16

### Patch Changes

- Updated dependencies [e6087c9]
  - @ai-sdk/provider-utils@5.0.28
  - @ai-sdk/anthropic@4.0.40

## 3.0.15

### Patch Changes

- Updated dependencies [4579b08]
  - @ai-sdk/anthropic@4.0.39

## 3.0.14

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27
  - @ai-sdk/anthropic@4.0.38

## 3.0.13

### Patch Changes

- Updated dependencies [401a4ba]
  - @ai-sdk/provider-utils@5.0.26
  - @ai-sdk/anthropic@4.0.37

## 3.0.12

### Patch Changes

- Updated dependencies [ad6a650]
- Updated dependencies [81cd026]
  - @ai-sdk/provider@4.0.7
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/anthropic@4.0.36

## 3.0.11

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - @ai-sdk/anthropic@4.0.35

## 3.0.10

### Patch Changes

- Updated dependencies [e6415bd]
  - @ai-sdk/anthropic@4.0.34

## 3.0.9

### Patch Changes

- Updated dependencies [3469d0c]
  - @ai-sdk/provider@4.0.6
  - @ai-sdk/anthropic@4.0.33
  - @ai-sdk/provider-utils@5.0.23

## 3.0.8

### Patch Changes

- Updated dependencies [8b96941]
  - @ai-sdk/anthropic@4.0.32

## 3.0.7

### Patch Changes

- Updated dependencies [2b60826]
- Updated dependencies [7a9da75]
  - @ai-sdk/provider-utils@5.0.22
  - @ai-sdk/anthropic@4.0.31

## 3.0.6

### Patch Changes

- Updated dependencies [1bec07d]
  - @ai-sdk/provider-utils@5.0.21
  - @ai-sdk/anthropic@4.0.30

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
