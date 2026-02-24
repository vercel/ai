import { zerog } from '@ai-sdk/zerog';
import { generateText } from 'ai';
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function main() {
  // Initialize 0G Compute broker
  const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
  const wallet = new ethers.Wallet(process.env.ZEROG_PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Fund account if needed (0.1 OG tokens for ~10,000 requests)
  // await broker.ledger.addLedger("0.1");

  // Get service metadata for llama model
  const providerAddress = '0xf07240Efa67755B5311bc75784a061eDB47165Dd';
  const { endpoint } = await broker.inference.getServiceMetadata(providerAddress);

  // Acknowledge provider (required before first use)
  await broker.inference.acknowledgeProviderSigner(providerAddress);

  // Create 0G provider instance
  const zeroGProvider = zerog({
    broker,
    providerAddress,
    baseURL: endpoint,
  });

  const { text, usage } = await generateText({
    model: zeroGProvider('llama-3.3-70b-instruct'),
    prompt: 'Explain the benefits of decentralized AI inference networks.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);

  // Check remaining balance
  const account = await broker.ledger.getLedger();
  console.log(`Remaining balance: ${ethers.formatEther(account.balance)} OG`);
}

main().catch(console.error);
