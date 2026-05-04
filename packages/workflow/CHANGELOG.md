# @ai-sdk/workflow

## 1.0.0-canary.32

### Patch Changes

- 0c4c275: trigger initial canary release
- Updated dependencies [0c4c275]
  - @ai-sdk/provider-utils@5.0.0-canary.31
  - @ai-sdk/provider@4.0.0-canary.15
  - ai@7.0.0-canary.117

## 1.0.0-beta.31

### Patch Changes

- ai@7.0.0-beta.116

## 1.0.0-beta.30

### Patch Changes

- Updated dependencies [08d2129]
- Updated dependencies [202f107]
  - @ai-sdk/provider-utils@5.0.0-beta.30
  - ai@7.0.0-beta.115

## 1.0.0-beta.29

### Patch Changes

- 258c093: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [43a6750]
- Updated dependencies [81caa5d]
- Updated dependencies [1f7db50]
- Updated dependencies [9bd6512]
- Updated dependencies [258c093]
- Updated dependencies [b6783da]
- Updated dependencies [6147cdf]
  - ai@7.0.0-beta.114
  - @ai-sdk/provider-utils@5.0.0-beta.29
  - @ai-sdk/provider@4.0.0-beta.14

## 1.0.0-beta.28

### Patch Changes

- 9f0e36c: trigger release for all packages after provenance setup
- Updated dependencies [9f0e36c]
  - ai@7.0.0-beta.113
  - @ai-sdk/provider@4.0.0-beta.13
  - @ai-sdk/provider-utils@5.0.0-beta.28

## 1.0.0-beta.27

### Patch Changes

- 29d8cf4: feat(ai): rename the core-event types
- a0ca584: fix (workflow): preserve invalid tool calls as errors instead of emitting synthetic success results
- Updated dependencies [785fe16]
- Updated dependencies [5f3749c]
- Updated dependencies [0a51f7d]
- Updated dependencies [71d3022]
- Updated dependencies [67df0a0]
- Updated dependencies [4181cfe]
- Updated dependencies [51ce232]
- Updated dependencies [cf93359]
- Updated dependencies [befb78c]
- Updated dependencies [29d8cf4]
- Updated dependencies [0458559]
- Updated dependencies [58a2ad7]
- Updated dependencies [5852c0a]
- Updated dependencies [37d69b2]
- Updated dependencies [1043274]
- Updated dependencies [7f59f04]
- Updated dependencies [7677c1e]
- Updated dependencies [116c89f]
- Updated dependencies [f58f9bc]
- Updated dependencies [e1bfb9c]
- Updated dependencies [e87d71b]
- Updated dependencies [9d486aa]
- Updated dependencies [9b0bc8a]
- Updated dependencies [fc92055]
- Updated dependencies [4e095b0]
  - @ai-sdk/provider-utils@5.0.0-beta.27
  - ai@7.0.0-beta.112

## 1.0.0-beta.26

### Major Changes

- 1949571: feat(ai): make experimental_telemetry stable

### Patch Changes

- f32c750: refactoring(ai): simplify mergeAbortSignals
- Updated dependencies [f319fde]
- Updated dependencies [1949571]
- Updated dependencies [511902c]
- Updated dependencies [6542d93]
- Updated dependencies [2e98477]
- Updated dependencies [876fd3e]
- Updated dependencies [f32c750]
  - ai@7.0.0-beta.111
  - @ai-sdk/provider-utils@5.0.0-beta.26

## 1.0.0-beta.25

### Patch Changes

- Updated dependencies [72cb801]
  - ai@7.0.0-beta.110

## 1.0.0-beta.24

### Patch Changes

- eea8d98: refactoring: rename tool execution events
- Updated dependencies [ec98264]
- Updated dependencies [eea8d98]
- Updated dependencies [75ef93e]
  - ai@7.0.0-beta.109
  - @ai-sdk/provider-utils@5.0.0-beta.25

## 1.0.0-beta.23

### Patch Changes

- Updated dependencies [f807e45]
  - @ai-sdk/provider-utils@5.0.0-beta.24
  - ai@7.0.0-beta.108

## 1.0.0-beta.22

### Patch Changes

- Updated dependencies [350ea38]
  - @ai-sdk/provider-utils@5.0.0-beta.23
  - ai@7.0.0-beta.107

## 1.0.0-beta.21

### Patch Changes

- fbea042: refactor: replace duplicate `filterTools`/`filterToolSet` with shared `experimental_filterActiveTools` from `ai`

## 1.0.0-beta.20

### Patch Changes

- ai@7.0.0-beta.106

## 1.0.0-beta.19

### Patch Changes

- Updated dependencies [33d099c]
  - ai@7.0.0-beta.105

## 1.0.0-beta.18

### Patch Changes

- eba685c: Remove `maxSteps` option from `WorkflowAgent`. Use `stopWhen` with stop conditions like `isStepCount()` instead.
- Updated dependencies [2a74d43]
  - ai@7.0.0-beta.104

## 1.0.0-beta.17

### Patch Changes

- 382d53b: refactoring: rename context to runtimeContext
- c3d4019: chore(ai): rename 'TelemetrySettings' to 'TelemetryOptions'
- 083947b: feat(ai): separate toolsContext from context
- Updated dependencies [382d53b]
- Updated dependencies [7bf7d7f]
- Updated dependencies [c3d4019]
- Updated dependencies [083947b]
  - ai@7.0.0-beta.103
  - @ai-sdk/provider-utils@5.0.0-beta.22

## 1.0.0-beta.16

### Patch Changes

- ai@7.0.0-beta.102

## 1.0.0-beta.15

### Patch Changes

- Updated dependencies [4873966]
  - ai@7.0.0-beta.101

## 1.0.0-beta.14

### Patch Changes

- Updated dependencies [add1126]
  - @ai-sdk/provider-utils@5.0.0-beta.21
  - ai@7.0.0-beta.100

## 1.0.0-beta.13

### Patch Changes

- Updated dependencies [2a9c144]
  - ai@7.0.0-beta.99

## 1.0.0-beta.12

### Patch Changes

- ai@7.0.0-beta.98

## 1.0.0-beta.11

### Patch Changes

- Updated dependencies [208d045]
  - ai@7.0.0-beta.97

## 1.0.0-beta.10

### Patch Changes

- ai@7.0.0-beta.96

## 1.0.0-beta.9

### Patch Changes

- Updated dependencies [c4f4b5f]
  - ai@7.0.0-beta.95

## 1.0.0-beta.8

### Patch Changes

- 0455f24: Enrich WorkflowAgent callback event shapes to align with ToolLoopAgent:
  - Add `stepNumber` to `onToolCallStart` and `onToolCallFinish`
  - Add `steps` (previous step results) to `onStepStart`
  - Adopt discriminated union pattern (`success: true/false`) for `onToolCallFinish`
  - Add `durationMs` to `onToolCallFinish`

## 1.0.0-beta.7

### Patch Changes

- Updated dependencies [1582efa]
  - ai@7.0.0-beta.94

## 1.0.0-beta.6

### Patch Changes

- Updated dependencies [bc47739]
  - ai@7.0.0-beta.93

## 1.0.0-beta.5

### Patch Changes

- bf6c17b: Add `id` property to WorkflowAgent for telemetry identification, matching ToolLoopAgent's API surface.
- 3ca592a: Add `prompt` as an alternative to `messages` in `WorkflowAgent.stream()`, matching the `AgentCallParameters` pattern from ToolLoopAgent.
- eb49d29: Add constructor-level defaults for `stopWhen`, `activeTools`, `output`, `experimental_repairToolCall`, and `experimental_download` to WorkflowAgent, matching ToolLoopAgent's pattern. Stream-level values override constructor defaults.

## 1.0.0-beta.4

### Patch Changes

- ai@7.0.0-beta.92

## 1.0.0-beta.3

### Patch Changes

- 0e462a7: Use `LanguageModel` type for model parameter, aligning with `ToolLoopAgent`. Remove async factory model form. Rename callback types to use `WorkflowAgentOn*` prefix.

## 1.0.0-beta.2

### Patch Changes

- ai@7.0.0-beta.91

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies [1db29c8]
  - ai@7.0.0-beta.90

## 1.0.0-beta.0

### Major Changes

- b3976a2: initial version

### Patch Changes

- Updated dependencies [b3976a2]
- Updated dependencies [ff5eba1]
  - @ai-sdk/provider-utils@5.0.0-beta.20
  - @ai-sdk/provider@4.0.0-beta.12
  - ai@7.0.0-beta.89
