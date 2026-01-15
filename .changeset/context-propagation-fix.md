---
'ai': patch
---

fix(ai): maintain OpenTelemetry context across async generator yields

Fixes an issue where OpenTelemetry context was lost at async generator yield boundaries, causing nested ToolLoopAgent spans to escape to the parent agent's level in observability platforms.

The fix ensures that when `recordSpan` is used with async generators (e.g., in tool execution), the active context is explicitly maintained using `context.with()`, preventing span hierarchy corruption in nested agent scenarios.

Closes #11720
