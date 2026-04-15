# @ai-sdk/workflow

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
