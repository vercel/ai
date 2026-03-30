# Gemini Thinking Models: `thoughtSignature` Propagation for Parallel Tool Calls

## The Problem

Gemini thinking models (e.g. `gemini-2.5-flash-preview-04-17`, Gemini 3 Flash) attach a `thoughtSignature` field to `functionCall` parts in the response. This signature acts as a cryptographic link between the model's internal reasoning chain and the tool call it produced. When the conversation is replayed on subsequent turns (for multi-step agentic loops), the API expects every `functionCall` part to carry its `thoughtSignature` — otherwise the server cannot verify that the replayed tool call matches the model's original reasoning.

The bug: when the model issues **parallel tool calls** (multiple `functionCall` parts in a single assistant turn), it only populates `thoughtSignature` on the **first** `functionCall` part. The remaining parts have `thoughtSignature: undefined` or missing entirely.

## What Goes Wrong

On the next `generateText` / `streamText` step, the AI SDK replays the full conversation history to the Gemini API. The replayed assistant message contains multiple `functionCall` parts, but only the first has a `thoughtSignature`. The API then either:

1. **Returns HTTP 400** — `"Invalid value at 'contents[N].parts[M]'... thoughtSignature is required"` — the request is rejected entirely.
2. **Silently drops parts** — in some API versions, the missing-signature parts are quietly ignored, causing the model to "forget" tool results and hallucinate or loop.

Both outcomes break multi-step tool-use flows. The failure is non-deterministic because it only triggers when the model decides to issue 2+ tool calls in parallel, which depends on the prompt and model temperature.

## The Fix

After mapping assistant content parts to the Google Generative AI wire format, we scan for `functionCall` parts. If there are 2+ and at least one carries a `thoughtSignature`, we copy that signature to every `functionCall` part that is missing one. Parts that already have their own signature are left untouched.

```typescript
function propagateThoughtSignatureToParallelFunctionCalls(
  parts: GoogleGenerativeAIContentPart[],
): void {
  const functionCallIndices: number[] = [];
  let firstSignature: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && 'functionCall' in part) {
      functionCallIndices.push(i);
      if (
        firstSignature === undefined &&
        'thoughtSignature' in part &&
        typeof part.thoughtSignature === 'string' &&
        part.thoughtSignature.length > 0
      ) {
        firstSignature = part.thoughtSignature;
      }
    }
  }

  if (functionCallIndices.length < 2 || firstSignature === undefined) {
    return;
  }

  for (const idx of functionCallIndices) {
    const part = parts[idx];
    if (!part.thoughtSignature || part.thoughtSignature.length === 0) {
      part.thoughtSignature = firstSignature;
    }
  }
}
```

This is safe because:

- **No-op for single tool calls** — only activates when 2+ `functionCall` parts exist in one turn.
- **No-op when no signatures present** — if the model is a non-thinking model (no `thoughtSignature` on any part), nothing changes.
- **Preserves existing signatures** — only fills in missing ones; never overwrites.
- **Idempotent** — running it twice produces the same result.

## Why This Is Necessary (Not a Google-Side Fix)

This is fundamentally an inconsistency in Gemini's response format. The model should populate `thoughtSignature` on every `functionCall` part, not just the first. Google has acknowledged the issue:

> https://discuss.ai.google.dev/t/gemini-3-flash-preview-inconsistent-thought-signature-generation-in-parallel-function-calls-causes-400-errors-and-potential-silent-data-loss/118936

However, fixing it on the model side requires changes to the serving infrastructure across all Gemini thinking model variants and API versions, which has no guaranteed timeline. The SDK-side fix is the correct place to handle this since:

1. The SDK already transforms the conversation history before sending it to the API (e.g. mapping `tool-call` parts to `functionCall` wire format).
2. The SDK is the layer that **replays** the history — it receives the incomplete signatures from the model and sends them back. It has full visibility into the problem.
3. The fix is minimal, local to `convertToGoogleGenerativeAIMessages`, and has no effect on non-thinking models or single tool calls.

## Upstream PR

https://github.com/vercel/ai/pull/13908

## Interim Workaround

Until the upstream PR is merged and released, the fix is applied via a postinstall script:

```
bun scripts/apply-google-ai-sdk-thought-signature-patch.ts
```

This script patches the compiled `dist/` files in `node_modules/@ai-sdk/google` with the same logic, using string-based needle matching. It is idempotent and fails gracefully if the upstream code layout changes.
