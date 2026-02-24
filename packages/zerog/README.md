# 0G Compute Provider

The **0G Compute provider** for the [AI SDK](https://ai-sdk.dev) contains language model support for the [0G Compute Network](https://0g.ai).

The 0G Compute Network is a decentralized AI inference platform that provides:

- **Decentralized Infrastructure**: AI inference powered by a distributed network of GPU providers
- **Verifiable Computations**: TEE (Trusted Execution Environment) verification for select models  
- **Competitive Pricing**: Market-driven pricing with micropayments
- **High Availability**: Multiple providers ensure service reliability

## Setup

The 0G Compute provider is available in the `@ai-sdk/zerog` module. You can install it with:

```bash
npm i @ai-sdk/zerog @0glabs/0g-serving-broker ethers crypto-js
```

## Provider Instance

To use the 0G Compute provider, you need to initialize the broker and create a provider instance:

```ts
import { zerog } from '@ai-sdk/zerog';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';

// Initialize the broker
const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
const wallet = new ethers.Wallet(process.env.ZEROG_PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);

// Fund your account (0.1 OG tokens ≈ 10,000 requests)
await broker.ledger.addLedger("0.1");

// Get service metadata
const providerAddress = '0xf07240Efa67755B5311bc75784a061eDB47165Dd';
const { endpoint } = await broker.inference.getServiceMetadata(providerAddress);

// Acknowledge provider (required before first use)
await broker.inference.acknowledgeProviderSigner(providerAddress);

// Create provider instance
const zeroGProvider = zerog({
  broker,
  providerAddress,
  baseURL: endpoint,
});
```

## Language Models

You can create models that call the 0G Compute API through the provider instance:

```ts
import { zerog } from '@ai-sdk/zerog';
import { generateText } from 'ai';

const { text } = await generateText({
  model: zeroGProvider('llama-3.3-70b-instruct'),
  prompt: 'Explain the benefits of decentralized AI inference.',
});
```

## Available Models

The 0G Compute Network currently supports:

- `llama-3.3-70b-instruct` - State-of-the-art 70B parameter model (TEE verified)
- `deepseek-r1-70b` - Advanced reasoning model (TEE verified)

## Documentation

Please check out the **[0G Compute provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/zerog)** for more information.
