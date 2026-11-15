import type { Readable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

export function monitorACPAgentStderr({
  stderr,
  onStderrLine,
}: {
  stderr: Readable;
  onStderrLine: (line: string) => void;
}): Promise<never> {
  let rejectFailure!: (error: unknown) => void;
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  void failure.catch(() => {});

  void (async () => {
    stderr.setEncoding('utf8');
    let pending = '';
    for await (const chunk of stderr) {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) handleStderrLine({ line });
    }
    if (pending.length > 0) handleStderrLine({ line: pending });
  })().catch(error => rejectFailure(error));

  return failure;

  function handleStderrLine({ line }: { line: string }): void {
    if (line.length === 0) return;
    onStderrLine(line);
    const normalizedLine = stripVTControlCharacters(line);

    /*
     * An ACP agent can log a response-stream decoding failure without rejecting
     * its pending JSON-RPC prompt. Once the provider stream cannot be decoded,
     * no valid prompt completion can reach the ACP client, so the bridge must
     * fail the turn instead of waiting indefinitely.
     */
    if (
      normalizedLine
        .toLowerCase()
        .includes('failed to deserialize responsestreamevent from stream')
    ) {
      rejectFailure(
        new Error('ACP agent failed to deserialize a streamed response.'),
      );
    }
  }
}
