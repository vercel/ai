# @ai-sdk/minimax

## 2.0.14

### Patch Changes

- Updated dependencies [57d88f5]
  - @ai-sdk/anthropic@3.0.116

## 2.0.13

### Patch Changes

- 2c90e90: fix(provider/minimax): send a default `16:9` ratio for MiniMax-H3 text-to-video

## 2.0.12

### Patch Changes

- 658d7d9: Add model-aware MiniMax 480P and 768P video resolutions, duration limits, and reference-input validation.
- 658d7d9: Map MiniMax 480P and 768P frame sizes onto their named video resolution tiers, so a typed top-level `resolution` can reach them.
- Updated dependencies [cc23556]
  - @ai-sdk/provider-utils@4.0.50
  - @ai-sdk/anthropic@3.0.115

## 2.0.11

### Patch Changes

- Updated dependencies [9a521b9]
  - @ai-sdk/provider-utils@4.0.49
  - @ai-sdk/anthropic@3.0.114

## 2.0.10

### Patch Changes

- Updated dependencies [5642849]
  - @ai-sdk/provider-utils@4.0.48
  - @ai-sdk/anthropic@3.0.113

## 2.0.9

### Patch Changes

- Updated dependencies [2d172fb]
  - @ai-sdk/provider-utils@4.0.47
  - @ai-sdk/anthropic@3.0.112

## 2.0.8

### Patch Changes

- Updated dependencies [8533108]
- Updated dependencies [31205a4]
  - @ai-sdk/anthropic@3.0.111
  - @ai-sdk/provider-utils@4.0.46

## 2.0.7

### Patch Changes

- Updated dependencies [b2a4d5a]
  - @ai-sdk/provider-utils@4.0.45
  - @ai-sdk/anthropic@3.0.110

## 2.0.6

### Patch Changes

- Updated dependencies [2171d15]
  - @ai-sdk/provider@3.0.15
  - @ai-sdk/anthropic@3.0.109
  - @ai-sdk/provider-utils@4.0.44

## 2.0.5

### Patch Changes

- Updated dependencies [dab0a08]
  - @ai-sdk/provider-utils@4.0.43
  - @ai-sdk/anthropic@3.0.108

## 2.0.4

### Patch Changes

- Updated dependencies [ee2bf30]
  - @ai-sdk/provider-utils@4.0.42
  - @ai-sdk/anthropic@3.0.107

## 2.0.3

### Patch Changes

- Updated dependencies [b74e654]
  - @ai-sdk/anthropic@3.0.106

## 2.0.2

### Patch Changes

- Updated dependencies [0a295e3]
  - @ai-sdk/anthropic@3.0.105

## 2.0.1

### Patch Changes

- 6be018f: Add video model support to the MiniMax provider (`minimax.video`) for the MiniMax-H3 model, including text-to-video, first/last-frame, and reference-to-video generation.

## 2.0.0

### Major Changes

- 56c055b: Add MiniMax provider with language model support for the MiniMax-M model series.
