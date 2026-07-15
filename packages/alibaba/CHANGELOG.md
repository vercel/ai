# @ai-sdk/alibaba

## 1.0.39

### Patch Changes

- Updated dependencies [94fda5c]
  - @ai-sdk/openai-compatible@2.0.61

## 1.0.38

### Patch Changes

- Updated dependencies [06fb54c]
  - @ai-sdk/provider-utils@4.0.39
  - @ai-sdk/openai-compatible@2.0.60

## 1.0.37

### Patch Changes

- e1af05f: feat (video): support video (not just image) reference inputs in `inputReferences` for reference-to-video generation
- Updated dependencies [e1af05f]
  - @ai-sdk/provider@3.0.14
  - @ai-sdk/openai-compatible@2.0.59
  - @ai-sdk/provider-utils@4.0.38

## 1.0.36

### Patch Changes

- bef93ae: fix(security): prevent streaming tool calls from finalizing on parsable partial JSON

  Streaming tool call arguments were finalized using `isParsableJson()` as a heuristic for completion. If partial accumulated JSON happened to be valid JSON before all chunks arrived, the tool call would be executed with incomplete arguments. Tool call finalization now only occurs in `flush()` after the stream is fully consumed.

- 327642b: fix: more precise default message for tool execution denial
- Updated dependencies [4d4e176]
- Updated dependencies [bef93ae]
- Updated dependencies [d559de9]
- Updated dependencies [327642b]
  - @ai-sdk/openai-compatible@2.0.58
  - @ai-sdk/provider-utils@4.0.37

## 1.0.35

### Patch Changes

- 7dea716: feat(alibaba): support wan2.7 text-to-video and reference-to-video models with the new protocol (`input.media`, `resolution` + `ratio`)
- Updated dependencies [0952964]
  - @ai-sdk/provider-utils@4.0.36
  - @ai-sdk/openai-compatible@2.0.57

## 1.0.34

### Patch Changes

- Updated dependencies [ea1e95b]
  - @ai-sdk/provider-utils@4.0.35
  - @ai-sdk/openai-compatible@2.0.56

## 1.0.33

### Patch Changes

- fa850e6: feat (video): add first-class `frameImages` and `inputReferences` call options for video generation
- Updated dependencies [fa850e6]
  - @ai-sdk/provider@3.0.13
  - @ai-sdk/openai-compatible@2.0.55
  - @ai-sdk/provider-utils@4.0.34

## 1.0.32

### Patch Changes

- Updated dependencies [b30e43a]
  - @ai-sdk/provider-utils@4.0.33
  - @ai-sdk/openai-compatible@2.0.54

## 1.0.31

### Patch Changes

- f19334d: feat (video): add first-class `generateAudio` call option
- Updated dependencies [f19334d]
  - @ai-sdk/provider@3.0.12
  - @ai-sdk/openai-compatible@2.0.53
  - @ai-sdk/provider-utils@4.0.32

## 1.0.30

### Patch Changes

- 1b40ac7: Publish all packages under the `@ai-v6` dist tag.
- Updated dependencies [1b40ac7]
  - @ai-sdk/openai-compatible@2.0.52
  - @ai-sdk/provider-utils@4.0.31
  - @ai-sdk/provider@3.0.11

## 1.0.29

### Patch Changes

- Updated dependencies [779f5cd]
  - @ai-sdk/provider-utils@4.0.30
  - @ai-sdk/openai-compatible@2.0.51

## 1.0.28

### Patch Changes

- Updated dependencies [bfa5864]
- Updated dependencies [f42aa79]
  - @ai-sdk/provider-utils@4.0.29
  - @ai-sdk/openai-compatible@2.0.50

## 1.0.27

### Patch Changes

- Updated dependencies [942f2f8]
  - @ai-sdk/provider-utils@4.0.28
  - @ai-sdk/openai-compatible@2.0.49

## 1.0.26

### Patch Changes

- bc29fbe: feat(aliababa): add embedding model support

## 1.0.25

### Patch Changes

- Updated dependencies [e40e1d4]
  - @ai-sdk/openai-compatible@2.0.48

## 1.0.24

### Patch Changes

- 33b10a2: Add `qwen3.7-max` model ID to Alibaba and AI Gateway.

## 1.0.23

### Patch Changes

- Updated dependencies [f591416]
  - @ai-sdk/provider-utils@4.0.27
  - @ai-sdk/openai-compatible@2.0.47

## 1.0.22

### Patch Changes

- Updated dependencies [38966ab]
  - @ai-sdk/openai-compatible@2.0.46

## 1.0.21

### Patch Changes

- Updated dependencies [6043d24]
  - @ai-sdk/openai-compatible@2.0.45

## 1.0.20

### Patch Changes

- Updated dependencies [7beadf0]
  - @ai-sdk/provider-utils@4.0.26
  - @ai-sdk/openai-compatible@2.0.44

## 1.0.19

### Patch Changes

- a727da4: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [a727da4]
  - @ai-sdk/openai-compatible@2.0.43
  - @ai-sdk/provider-utils@4.0.25
  - @ai-sdk/provider@3.0.10

## 1.0.18

### Patch Changes

- a7f3c72: trigger release for all packages after provenance setup
- Updated dependencies [a7f3c72]
- Updated dependencies [408a2ad]
  - @ai-sdk/openai-compatible@2.0.42
  - @ai-sdk/provider@3.0.9
  - @ai-sdk/provider-utils@4.0.24

## 1.0.17

### Patch Changes

- d42076d: Add AI Gateway hint to provider READMEs
- Updated dependencies [d42076d]
  - @ai-sdk/openai-compatible@2.0.41

## 1.0.16

### Patch Changes

- Updated dependencies [01c9c16]
  - @ai-sdk/openai-compatible@2.0.40

## 1.0.15

### Patch Changes

- Updated dependencies [6247886]
  - @ai-sdk/provider-utils@4.0.23
  - @ai-sdk/openai-compatible@2.0.39

## 1.0.14

### Patch Changes

- Updated dependencies [0469aed]
  - @ai-sdk/provider-utils@4.0.22
  - @ai-sdk/openai-compatible@2.0.38

## 1.0.13

### Patch Changes

- 055cd68: fix: publish v6 to latest npm dist tag
- Updated dependencies [055cd68]
  - @ai-sdk/openai-compatible@2.0.37
  - @ai-sdk/provider-utils@4.0.21

## 1.0.12

### Patch Changes

- 4ed55cb: fix(provider/alibaba): handle single-item content array cache control

## 1.0.11

### Patch Changes

- Updated dependencies [64ac0fd]
  - @ai-sdk/provider-utils@4.0.20
  - @ai-sdk/openai-compatible@2.0.36

## 1.0.10

### Patch Changes

- Updated dependencies [ad4cfc2]
  - @ai-sdk/provider-utils@4.0.19
  - @ai-sdk/openai-compatible@2.0.35

## 1.0.9

### Patch Changes

- Updated dependencies [824b295]
  - @ai-sdk/provider-utils@4.0.18
  - @ai-sdk/openai-compatible@2.0.34

## 1.0.8

### Patch Changes

- Updated dependencies [89caf28]
  - @ai-sdk/openai-compatible@2.0.33

## 1.0.7

### Patch Changes

- Updated dependencies [08336f1]
  - @ai-sdk/provider-utils@4.0.17
  - @ai-sdk/openai-compatible@2.0.32

## 1.0.6

### Patch Changes

- Updated dependencies [58bc42d]
  - @ai-sdk/provider-utils@4.0.16
  - @ai-sdk/openai-compatible@2.0.31

## 1.0.5

### Patch Changes

- 6fe0630: fix(provider/alibaba): fix cache control for non-system messages

## 1.0.4

### Patch Changes

- Updated dependencies [4024a3a]
  - @ai-sdk/provider-utils@4.0.15
  - @ai-sdk/openai-compatible@2.0.30

## 1.0.3

### Patch Changes

- 99fbed8: feat: normalize provider specific model options type names and ensure they are exported
- Updated dependencies [99fbed8]
  - @ai-sdk/openai-compatible@2.0.29

## 1.0.2

### Patch Changes

- 4d8c6b9: feat (provider/alibaba): add video generation support

## 1.0.1

### Patch Changes

- Updated dependencies [7168375]
  - @ai-sdk/provider@3.0.8
  - @ai-sdk/openai-compatible@2.0.28
  - @ai-sdk/provider-utils@4.0.14

## 1.0.0

### Major Changes

- aa924c7: feat(provider/alibaba): initial alibaba provider
