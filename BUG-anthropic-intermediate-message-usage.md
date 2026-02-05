# Bug: Anthropic Intermediate Message Usage Inconsistency

## Summary

In multi-message streaming scenarios (e.g., programmatic tool calling with code execution), intermediate `message_start` events reset `usage.input_tokens` to `0`, causing inconsistent values between computed `inputTokens` and `raw` usage in the finish events.

## The Bug

In `packages/anthropic/src/anthropic-messages-language-model.ts`, the `message_start` handler unconditionally overwrites `usage.input_tokens`:

```typescript
case 'message_start': {
  usage.input_tokens = value.message.usage.input_tokens;  // <-- Always overwrites
  // ...
}
```

When Anthropic sends intermediate continuation messages during programmatic tool calling (e.g., code execution calling user-defined tools), these intermediate `message_start` events have `input_tokens: 0`. This resets the accumulated usage, causing the computed `inputTokens.noCache` and `inputTokens.total` to be `0` in the finish event, while `raw` (merged from `rawUsage`) retains the correct accumulated value.

## Fixture Evidence

**File:** `packages/anthropic/src/__fixtures__/anthropic-programmatic-tool-calling.1.chunks.txt`

The fixture shows:

1. **Line 1** - First `message_start`: `"input_tokens": 3369` (initial prompt)
2. **Line 166** - First `message_delta`: `"input_tokens": 3369`
3. **Line 168** - Intermediate `message_start`: `"input_tokens": 0` (continuation - resets usage!)
4. **Lines 170-192** - More intermediate `message_start` events with `"input_tokens": 0`
5. **Line 194** - Final `message_start`: `"input_tokens": 4551` (accumulated total)
6. **Line 277** - Final `message_delta`: `"input_tokens": 4551`

## Snapshot Inconsistency

**File:** `packages/anthropic/src/__snapshots__/anthropic-messages-language-model.test.ts.snap`

Around lines 13347-13365, an intermediate finish event shows:

```javascript
"usage": {
  "inputTokens": {
    "cacheRead": 0,
    "cacheWrite": 0,
    "noCache": 0,      // <-- Computed from reset usage.input_tokens
    "total": 0,        // <-- Computed from reset usage.input_tokens
  },
  "outputTokens": {
    "total": 725,
  },
  "raw": {
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "input_tokens": 4551,   // <-- From merged rawUsage (correct value!)
    "output_tokens": 197,
  },
},
```

The `inputTokens.noCache` is `0` but `raw.input_tokens` is `4551` - these should be consistent.

## Root Cause

In `doStream()`:

1. **Line 1733:** `message_start` always sets `usage.input_tokens = value.message.usage.input_tokens`
2. **Lines 1865-1868:** `rawUsage` merges values: `rawUsage = { ...rawUsage, ...(value.usage as JSONObject) }`
3. **Line 1877:** `convertAnthropicMessagesUsage(usage)` computes `inputTokens` from the (reset) `usage.input_tokens`

The `rawUsage` correctly accumulates, but `usage.input_tokens` gets reset by intermediate messages.

## Proposed Fix

In `packages/anthropic/src/anthropic-messages-language-model.ts`, modify the `message_start` handler to only update `input_tokens` when the new value is non-zero:

```typescript
case 'message_start': {
  // Only update input_tokens if the new value is non-zero
  // (intermediate messages in programmatic tool calling report 0)
  if (value.message.usage.input_tokens > 0) {
    usage.input_tokens = value.message.usage.input_tokens;
  }
  usage.cache_read_input_tokens =
    value.message.usage.cache_read_input_tokens ?? 0;
  usage.cache_creation_input_tokens =
    value.message.usage.cache_creation_input_tokens ?? 0;
  // ... rest of the handler unchanged
```

This ensures intermediate continuation messages (which report `input_tokens: 0`) don't reset the accumulated usage value.

## Testing

After applying the fix:

1. Run `pnpm test` in `packages/anthropic`
2. The programmatic tool calling tests should now show consistent values between `inputTokens.noCache`/`total` and `raw.input_tokens`
3. Update snapshots with `pnpm test -- -u` if needed

## Related

This is a separate issue from the `message_delta` `input_tokens` fix (which correctly picks up the final accumulated value from `message_delta` events for server-side tool execution scenarios like web search, code execution, etc.).
