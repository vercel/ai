import { providers } from '@/lib/providers';

export async function GET() {
  return Response.json({
    providers: Object.fromEntries(
      Object.entries(providers).map(([id, provider]) => [
        id,
        {
          name: provider.name,
          keyName: provider.keyName,
          configured: Boolean(process.env[provider.keyName]),
        },
      ]),
    ),
  });
}
