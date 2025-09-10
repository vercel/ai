import { StreamTextResult, ToolSet } from 'ai';
import fs from 'fs';

export async function saveRawChunks({
  result,
  filename,
}: {
  result: StreamTextResult<any, any>;
  filename: string;
}) {
  const rawChunks: unknown[] = [];
  for await (const chunk of result.fullStream) {
    if (chunk.type === 'raw') {
      rawChunks.push(chunk.rawValue);
    }
  }

  fs.writeFileSync(
    filename,
    rawChunks.map(chunk => JSON.stringify(chunk)).join('\n'),
  );
}
