# Naming Conventions

## Stream Event and Part Type Names

Hyphenated type names (used in stream events, message parts, and UI message chunks) follow a **noun-verb** (subject-action) pattern:

```
<noun>-<action>
```

Examples:

- `text-start`, `text-delta`, `text-end`
- `reasoning-start`, `reasoning-delta`, `reasoning-end`
- `tool-input-start`, `tool-input-delta`, `tool-input-end`
- `stream-start`
- `tool-call`, `tool-result`, `tool-error`
- `source-url`, `source-document`
- `response-metadata`, `message-metadata`

The noun describes **what** the event is about, and the verb/action describes **what happened**.

Do **not** use verb-first names like `start-step` or `finish-step`. Use `step-start` and `step-end` instead.

### Preferred verbs

For streaming lifecycle events, use these verbs consistently:

| Verb | Meaning | Example |
|---|---|---|
| `start` | Beginning of a stream or section | `text-start`, `reasoning-start` |
| `delta` | Incremental update within a stream | `text-delta`, `tool-input-delta` |
| `end` | End of a stream or section | `text-end`, `reasoning-end` |

Use `end` (not `finish`, `stop`, or `complete`) for the final event in a lifecycle.

For non-lifecycle events, use the most specific verb that applies:

| Verb | Meaning | Example |
|---|---|---|
| `available` | Data is ready for consumption | `tool-input-available`, `tool-output-available` |
| `error` | An error occurred | `tool-input-error`, `tool-output-error` |
| `request` | A request for action (e.g. approval) | `tool-approval-request` |
| `response` | A response to a request | `tool-approval-response` |
| `denied` | A request was rejected | `tool-output-denied` |

> **Note:** There are existing violations of these conventions (`start-step` and `finish-step` in UI message stream chunks). These should be migrated to `step-start` and `step-end` when possible.
