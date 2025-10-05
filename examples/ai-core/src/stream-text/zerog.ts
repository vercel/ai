import { zerog } from '@ai-sdk/zerog';
import { streamText } from 'ai';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function main() {
  // Initialize 0G Compute broker
  const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
  const wallet = new ethers.Wallet(process.env.ZEROG_PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Get service metadata for deepseek reasoning model
  const providerAddress = '0x3feE5a4dd5FDb8a32dDA97Bed899830605dBD9D3';
  const { endpoint } = await broker.inference.getServiceMetadata(providerAddress);

  // Acknowledge provider (required before first use)
  await broker.inference.acknowledgeProviderSigner(providerAddress);

  // Create 0G provider instance
  const zeroGProvider = zerog({
    broker,
    providerAddress,
    baseURL: endpoint,
  });

  const { textStream } = await streamText({
    model: zeroGProvider('deepseek-r1-70b'),
    prompt: 'Solve this step by step: What is the derivative of x^3 + 2x^2 - 5x + 3?',
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }

  console.log();
}

main().catch(console.error);
