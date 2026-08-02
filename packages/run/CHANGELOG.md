# run

## 0.0.0

### Initial runtime

- Add secure QuickJS execution, named host bindings, resource limits, worker
  pooling, replayable batched interruptions, continuation codecs, and the
  `run()` and `createRunner()` APIs.
- Make replay deterministic across date, randomness, and concurrent binding
  settlement; validate and size-limit continuation state; and atomically
  consume expiring storage-backed continuations.
