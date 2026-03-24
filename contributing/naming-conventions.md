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

Do **not** use verb-first names like `start-step` or `finish-step`. Use `step-start` and `step-finish` instead.

> **Note:** There are existing violations of this convention (`start-step` and `finish-step` in UI message stream chunks). These should be migrated to `step-start` and `step-finish` when possible.
