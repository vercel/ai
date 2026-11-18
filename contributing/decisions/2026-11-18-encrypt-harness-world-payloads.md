# Encrypt HarnessAgent payloads at World storage boundaries

## Context and Problem Statement

HarnessAgent v2 writes session input, an authoritative event log, and output streams directly to a Workflow World. Using a World does not itself encrypt those writes: Workflow's runtime normally encrypts payloads before handing them to storage.

Agent payloads can contain credentials in configuration, prompts, tool inputs and results, errors, and adapter checkpoints. Protection must cover arbitrary nested data consistently across adapters and storage backends, including reads during recovery.

## Decision

Encrypt serialized payloads in the HarnessAgent v2 engine, immediately before World writes, and decrypt before deserialization on every read path. Adapters continue to receive decoded values and have no encryption responsibilities.

- Cover all three storage boundaries: session run input, complete log event envelopes, and complete output stream batches. Encrypting whole envelopes avoids maintaining a list of sensitive fields as adapter data and agent capabilities evolve.
- Obtain the run's raw key through `World.getEncryptionKeyForRun(runId, { deploymentId })`. Retrieval, derivation, and access control belong to the World, not a separate HarnessAgent secret configuration. Always use the run's creating deployment ID, including when another deployment resumes the run, so key selection does not change with the executing process.
- Resolve and import the key once per session handle and share it across storage operations. Keep keys process-local, outside session serialization, stored payloads, queue messages, and adapter APIs. A reconstructed handle resolves its key from the run's metadata.
- Reuse `importKey`, `encrypt`, and `decrypt` from the public `@workflow/core/encryption` entrypoint. These provide AES-256-GCM through Web Crypto, with a fresh random nonce for each encryption and an authentication tag that detects ciphertext tampering. Reusing the helpers avoids owning a separate cryptographic implementation. Accept the direct dependency on `@workflow/core`, but do not depend on its runtime or serialization internals.
- Retain the engine's JSON serializers. Store binary ciphertext as returned by the encryption helper. For text streams, base64-encode each complete encrypted batch and append a blank-line delimiter. Keep this framing when encryption is disabled. This preserves countable World chunk boundaries for resumed reads without interpreting ciphertext as record delimiters. Accept the encryption and base64 size overhead; base64 itself provides no confidentiality.
- Generate ciphertext once per logical log append and reuse those bytes for physical resends. Preserve append ordering and compare decoded event content for deduplication: randomized ciphertext must not become event identity.
- Follow Workflow's optional-key contract: an absent key hook or an `undefined` key means plaintext storage. The default in-memory World supplies no key. Applications requiring encryption must use a World that supplies one. Key lookup, key import, encryption, and decryption failures reject without plaintext fallback. Treat them as infrastructure failures, not ordinary persisted tool or turn failures. Stream transport writes remain best effort, but stream encryption failures must propagate through emission or flushing.

This protects persisted payloads, not the entire World or the running application. Infrastructure metadata remains readable, including run and deployment IDs, workflow and stream names, event types, correlation IDs, and queue routing. Payload sizes and timing remain visible. Queue messages carry run IDs rather than payloads; advisory log hints carry only newlines. Application logs, sandbox files, application-managed storage, and data sent to models or tools need their own protection.

## Alternatives Considered

- Require an encryption key before any World write: provides a strict no-plaintext guarantee, but overrides Workflow's optional-key contract and requires key management even for default in-memory execution. Exempting particular World implementations would add a separate encryption policy to the engine. We retain World-controlled encryption availability; applications requiring encrypted storage must select and configure a World that always supplies a key. An absent key is permitted, but a failed key lookup or cryptographic operation is not.
- Implement separate encryption and key management in HarnessAgent: avoids the crypto-helper dependency, but duplicates security-sensitive code and the World's deployment-aware key management. Sharing Workflow's key contract and helpers keeps those responsibilities in one place.
- Adopt Workflow's full serialization layer: shares more of Workflow's persistence machinery, but couples agent records to a different serializer and runtime-specific value handling. Byte-level encryption protects the existing agent format without expanding that dependency boundary.
- Encrypt only selected fields or only the authoritative log: reduces encryption work, but misses secrets in arbitrary adapter data and leaves copies in run input or output streams. Complete payload coverage is easier to maintain than field-by-field classification.

## More Information

- [Storage encryption implementation](../../packages/harness/src/agent/v2/internal/create-storage-encryption.ts)
- [Log persistence](../../packages/harness/src/agent/v2/internal/create-log.ts)
- [Output stream persistence](../../packages/harness/src/agent/v2/internal/create-stream-writer.ts)
