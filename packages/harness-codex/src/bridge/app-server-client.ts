import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const MAX_CODEX_FRAME_BYTES = 1024 * 1024;

const idSchema = z.union([z.string().min(1), z.number().int().safe()]);
const messageSchema = z.union([
  z.object({ method: z.string(), params: z.unknown().optional(), emittedAtMs: z.number().optional(), id: idSchema.optional() }).strict(),
  z.object({ id: idSchema, result: z.unknown() }).strict(),
  z.object({ id: idSchema, error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }) }).strict(),
]);
export type CodexServerMessage = Extract<z.infer<typeof messageSchema>, { method: string }>;

/** Private stdio only. Never reconnect or replay an RPC after transport loss. */
export class AppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }>();
  private readonly serverIds = new Set<string | number>();
  private nextId = 0;
  private failed = false;
  private rejectFailure!: (error: unknown) => void;
  readonly failure: Promise<never>;

  constructor(options: {
    executable: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    onMessage(message: CodexServerMessage): void;
  }) {
    this.failure = new Promise((_, reject) => { this.rejectFailure = reject; });
    void this.failure.catch(() => {});
    this.child = spawn(options.executable, options.args, {
      cwd: options.cwd, env: options.env, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.on('error', error => this.fail(error));
    this.child.stdin.on('error', error => this.fail(error));
    // Drain diagnostics without retaining unbounded or potentially secret data.
    this.child.stderr.resume();
    this.child.on('exit', () => this.fail(new Error('Codex app-server exited unexpectedly.')));
    const child = this.child;
    void (async () => {
      let buffer = Buffer.alloc(0);
      for await (const chunk of child.stdout) {
        buffer = Buffer.concat([buffer, chunk]);
        let end: number;
        while ((end = buffer.indexOf(10)) !== -1) {
          if (end > MAX_CODEX_FRAME_BYTES) throw new Error('Oversized Codex frame.');
          const line = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end));
          buffer = buffer.subarray(end + 1);
          const parsed = await safeParseJSON({ text: line, schema: messageSchema });
          if (!parsed.success) throw new Error('Malformed Codex frame.');
          const message = parsed.value;
          if ('method' in message) {
            if (message.id != null) {
              if (this.serverIds.has(message.id)) throw new Error('Duplicate Codex request id.');
              if (this.serverIds.size >= 10000) throw new Error('Too many Codex requests.');
              this.serverIds.add(message.id);
            }
            options.onMessage(message);
          } else {
            const request = typeof message.id === 'number' ? this.pending.get(message.id) : undefined;
            if (!request) throw new Error('Unknown or duplicate Codex response id.');
            this.pending.delete(message.id as number);
            clearTimeout(request.timer);
            if ('error' in message) {
              const error = new Error(`Codex RPC failed: ${message.error.message}`);
              request.reject(error);
              throw error;
            }
            request.resolve(message.result);
          }
        }
        if (buffer.length > MAX_CODEX_FRAME_BYTES) throw new Error('Oversized Codex frame.');
      }
      throw new Error('Codex protocol stream ended before shutdown.');
    })().catch(error => this.fail(error));
  }

  send(message: unknown): void {
    if (this.failed) throw new Error('Codex transport is closed.');
    const frame = JSON.stringify(message);
    if (Buffer.byteLength(frame) > MAX_CODEX_FRAME_BYTES) throw new Error('Oversized Codex frame.');
    this.child.stdin.write(frame + '\n');
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.nextId;
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Codex ${method} timed out.`)), 30000);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) { this.fail(error); }
    });
    return result;
  }

  fail(error: unknown): void {
    if (this.failed) return;
    this.failed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.rejectFailure(error);
    // The native process has no local execution tools and therefore no shell descendants.
    this.child.kill('SIGKILL');
  }

  close(): void { this.fail(new Error('Codex app-server stopped.')); }
}
