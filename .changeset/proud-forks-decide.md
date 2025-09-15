---
'ai': patch
---

<!-- @format -->

Added onToolOutput Callback to useChat Hook
This update adds a new onToolOutput callback to the useChat hook, enabling developers to handle tool execution outputs in their chat applications:

New onToolOutput Callback: Added onToolOutput callback to the useChat hook that triggers when tool outputs are received, providing access to tool results, metadata, and execution status

Enhanced Tool Output Handling: Improved the underlying tool output processing in processUIMessageStream to properly construct and pass tool output objects to the callback

Dynamic Tool Support: Enhanced support for both static and dynamic tool outputs with proper typing and state management

Better Developer Experience: The callback provides comprehensive tool output information including tool name, input, output, execution status, and preliminary results

Type Safety: Added proper TypeScript types for tool outputs to ensure type-safe handling of tool execution results

This feature enables developers to build more interactive chat experiences by responding to tool execution results in real-time, such as updating UI state, showing notifications, or triggering additional actions based on tool outputs.
