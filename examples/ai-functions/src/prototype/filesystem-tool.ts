import { openai } from '@ai-sdk/openai';
import { spawn } from 'node:child_process';
import { tool, ToolLoopAgent } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

const agent = new ToolLoopAgent({
  model: openai('gpt-5.5'),
  instructions: 'You are a helpful assistant that can run shell commands.',
  tools: {
    shell: tool({
      description: 'Run a shell command',
      inputSchema: z.object({
        command: z.string(),
      }),
      execute: async ({ command }) => {
        return new Promise<{
          exitCode: number;
          stdout: string;
          stderr: string;
        }>(resolve => {
          const childProcess = spawn(command, { shell: true });
          const stdout: Buffer[] = [];
          const stderr: Buffer[] = [];

          childProcess.stdout.on('data', data => {
            stdout.push(Buffer.from(data));
          });

          childProcess.stderr.on('data', data => {
            stderr.push(Buffer.from(data));
          });

          childProcess.on('error', error => {
            stderr.push(Buffer.from(error.message));
          });

          childProcess.on('close', exitCode => {
            resolve({
              exitCode: exitCode ?? 1,
              stdout: Buffer.concat(stdout).toString(),
              stderr: Buffer.concat(stderr).toString(),
            });
          });
        });
      },
    }),
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'List the files in my ~/Downloads directory',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});
