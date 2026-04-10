import { type GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { providerMetadata, text, usage } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      gateway: {
        byok: {
          bedrock: [
            {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              // region is required for Bedrock to construct the correct endpoint URL
              region: process.env.AWS_REGION ?? 'us-east-1',
              // sessionToken is optional, used for temporary credentials
              ...(process.env.AWS_SESSION_TOKEN && {
                sessionToken: process.env.AWS_SESSION_TOKEN,
              }),
            },
          ],
        },
      } satisfies GatewayProviderOptions,
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
  console.log(JSON.stringify(providerMetadata, null, 2));
});
