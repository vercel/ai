# SVS Verified Action Example For Vercel AI SDK

This directory is a PR-ready example package for the Vercel AI SDK ecosystem.
It is intentionally small so a framework maintainer can review it without the
private SVS implementation details.

## What The Example Shows

The example adds one Vercel AI SDK compatible tool:

```text
svsVerifyAndSubmitSolanaAction
```

The tool is created from the public SVS package export:

```js
import { createSvsVercelAiSdkTools } from "@svsprotocol/solana/vercel-ai";
```

It routes a prepared Solana action through SVS so the action is not trusted
until SVS checks signed bot identity, production readiness, human wallet
approval, registry proof, and portable verification.

## Proposed Upstream Placement

Suggested destination in a Vercel AI SDK docs or examples PR:

```text
examples/svs-verified-action/
```

The package is safe to copy because it uses only public dependencies and
placeholder environment values.

## Local Review

From this directory:

```sh
npm install
npm run validate
```

## Protocol Or Wallet Gate

Protocols and wallets can reject unverified automation by requiring the hosted
SVS registry before accepting an agent action:

```js
import { createHostedVerifiedAgentRegistryMiddleware } from "@svsprotocol/solana/protocol";

const requireVerifiedAgent = createHostedVerifiedAgentRegistryMiddleware({
  registryUrl: "https://registry.svsprotocol.com/registry.json",
  expectedRegistryHash: "PINNED_REGISTRY_HASH",
  trustPolicy: "high-trust"
});

await requireVerifiedAgent({ agent: { botId: "svs-demo-devnet-agent" } });
```

## Public References

- Docs: https://svsprotocol.com/docs
- Registry: https://registry.svsprotocol.com/registry.json
- Verified Agent Standard: https://svsprotocol.com/docs#verified-agent-standard
- Verifier: https://svsprotocol.com/verify

## Run Modes

The default run is import validation only. It does not require SVS credentials,
read your config, or submit an action:

```sh
node ./svs-verified-action.mjs
```

Run `npm run validate` to check the package files and placeholder env template
before opening the upstream PR.

Live submission is opt-in:

```sh
SVS_RUN_LIVE_SUBMIT=true node ./svs-verified-action.mjs
```

Live mode requires a real SVS dashboard, bot API key, request-signing secret,
controller wallet, current integration-contract hash, and a prepared serialized
transaction. Do not commit those values.

## Boundary

This package must contain no API keys, request-signing secrets, wallet
keypairs, local `data/` evidence, private dashboard source, admin endpoints, or
private operator artifacts.
