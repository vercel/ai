---
fileMatcher:
  - 'packages/harness-*/src/**/*.ts'
  - 'packages/harness/src/bridge/**/*.ts'
  - 'packages/harness/src/utils/bridge-*.ts'
---

# Harness Bridge Authentication Guidelines

Guidelines for securing host-to-bridge connections of bridge-backed harness adapters.

## HBAUTH-1: Authenticate host-to-bridge connections with public-key challenge-response

- **Severity**: blocker
- **Applies to**: bridge-backed harness adapters and the shared bridge code in `@ai-sdk/harness`
- **Sources**: `packages/harness/src/utils/bridge-auth.ts`, `packages/harness/src/bridge/bridge-auth.ts`

Create a fresh key pair per session with `createBridgeAuthKeyPair()` from `@ai-sdk/harness/utils`, pass only `publicKey` into the sandbox via `BRIDGE_AUTH_PUBLIC_KEY_ENV`, and connect with the `privateKey` so the bridge verifies a signed challenge before sending `bridge-hello`. Never authenticate with a shared secret (e.g. a token in the URL or sandbox env), since any code in the sandbox can read it and take over the bridge.

## HBAUTH-2: Keep the bridge private key on the host

- **Severity**: blocker
- **Applies to**: bridge-backed harness adapters

Store `privateKey` only in host-side state (e.g. resume state as `bridge.privateKey`) and never write it to the sandbox env, files, commands, or bridge frames. If the private key reaches the sandbox, sandbox code can forge proofs and control the bridge.
