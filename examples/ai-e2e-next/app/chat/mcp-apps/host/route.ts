import { readMCPAppResource, splitMCPAppTools } from '@ai-sdk/mcp';
import { createLocalMCPAppsClient } from '../mcp-client';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function POST(req: Request) {
  const requestUrl = new URL(req.url);
  const body = await req.json();
  const method = body.method;
  const params = asRecord(body.params);

  if (typeof method !== 'string') {
    return Response.json({ error: 'Missing method' }, { status: 400 });
  }

  const client = await createLocalMCPAppsClient(requestUrl.origin);

  try {
    switch (method) {
      case 'mcp-apps/read-resource': {
        if (typeof params?.uri !== 'string') {
          return Response.json({ error: 'Missing uri' }, { status: 400 });
        }

        return Response.json(
          await readMCPAppResource({ client, uri: params.uri }),
        );
      }

      case 'resources/read': {
        if (typeof params?.uri !== 'string') {
          return Response.json({ error: 'Missing uri' }, { status: 400 });
        }

        return Response.json(await client.readResource({ uri: params.uri }));
      }

      case 'tools/call': {
        if (typeof params?.name !== 'string') {
          return Response.json({ error: 'Missing tool name' }, { status: 400 });
        }

        const { appVisible } = splitMCPAppTools(await client.listTools());
        const isAllowed = appVisible.tools.some(
          tool => tool.name === params.name,
        );

        if (!isAllowed) {
          return Response.json(
            { error: 'Tool is not app-visible' },
            { status: 403 },
          );
        }

        return Response.json(
          await client.callTool({
            name: params.name,
            arguments: asRecord(params.arguments) ?? {},
          }),
        );
      }

      default:
        return Response.json({ error: 'Unsupported method' }, { status: 400 });
    }
  } finally {
    await client.close();
  }
}
