---
'ai': patch
---

feat(ai): add onStepFinish continuation support for validation and retry

Add ability for `onStepFinish` callback to return `StepContinueResult` to continue the generation loop with injected feedback messages. This enables validation and automatic retry functionality for `generateText`, `streamText`, and `generateObject`.

The callback signature is backward compatible - existing code returning `void` continues to work unchanged.
