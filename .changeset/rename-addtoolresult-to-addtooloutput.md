---
'ai': patch
---

Rename `addToolResult` to `addToolOutput` with deprecation support

We realized `addToolResult` is not the ideal naming and decided to rename it to `addToolOutput`. This is a deprecation - the old method still works but is marked as deprecated.

## Before

```ts
const { addToolResult } = useChat();

// Add successful tool result
addToolResult({
  tool: 'getWeather',
  toolCallId: 'call-123',
  output: { temperature: 72, condition: 'sunny' },
});

// Add error result
addToolResult({
  tool: 'getWeather',
  toolCallId: 'call-123',
  state: 'output-error',
  errorText: 'Failed to fetch weather data',
});
```

## After

```ts
const { addToolOutput } = useChat();

// Add successful tool result
addToolOutput({
  tool: 'getWeather',
  toolCallId: 'call-123',
  output: { temperature: 72, condition: 'sunny' },
});

// Add error result
addToolOutput({
  tool: 'getWeather',
  toolCallId: 'call-123',
  state: 'output-error',
  errorText: 'Failed to fetch weather data',
});
```

The deprecated `addToolResult` method continues to work exactly as before for backward compatibility.
