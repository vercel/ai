import { openai } from '@ai-sdk/openai';
import {
  generateText,
  isStepCount,
  tool,
  type ModelMessage,
  type ToolApprovalResponse,
  type ToolApprovalStatus,
} from 'ai';
import { execFile, spawn } from 'node:child_process';
import * as readline from 'node:readline/promises';
import { promisify } from 'node:util';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const execFileAsync = promisify(execFile);

// execFile's async/promisified form has no `input` option -- that key only
// exists on the *Sync variants (execFileSync). Found by testing this
// example's gate logic standalone before submitting it: the first version
// reported every case as unreachable, including ones that should trivially
// succeed -- the payload was silently never written to curl's stdin.
function runWithStdin(
  command: string,
  args: string[],
  input: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`exited ${code}: ${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// A tool with real stakes -- unlike a weather lookup, a shell command is
// exactly the class of action an admission gate exists for.
const runCommandTool = tool({
  description: 'Run a shell command and return its output.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to run'),
  }),
  execute: async ({ command }) => {
    try {
      const { stdout } = await execFileAsync('bash', ['-c', command], {
        timeout: 10_000,
      });
      return { stdout: stdout.slice(0, 2000) };
    } catch (error) {
      return { error: String(error) };
    }
  },
});

// --- The gate: a real call to a live tulip-compatible admission model ---
//
// Same three-word verdict contract used throughout this integration work
// (allow / require_human / deny), mapped 1:1 onto ToolApprovalStatus --
// unlike every other integration in this same body of work, this one needs
// no lossy mapping: 'approved' / {type:'denied'} / 'user-approval' cover
// exactly the same three states tulip's admission gate does, including a
// real pause-and-resume round trip (this SDK's own tool-approval-request /
// tool-approval-response protocol) rather than a hard block standing in
// for "ask a human."
const POLICY =
  'Before executing any shell command that could destroy data, irreversibly ' +
  'alter git history, or expose credentials -- including deleting files, ' +
  'force-pushing, resetting a shared branch, or reading a private key or ' +
  'secrets file -- you must obtain explicit user confirmation. Read-only, ' +
  'build, test, lint, and search commands do not require confirmation.';

const SYSTEM_PROMPT =
  'You are an admission gate for an AI agent. Given a written policy and a proposed ' +
  'action, decide what the policy requires:\n' +
  '  allow          — the policy permits this action to proceed\n' +
  '  require_human  — the policy requires a person to approve before it proceeds\n' +
  '  deny           — the policy forbids this action\n' +
  'Answer with exactly one of those three words and nothing else.';

const VERDICT_TO_STATUS: Record<string, ToolApprovalStatus> = {
  allow: 'approved',
  require_human: 'user-approval',
  deny: { type: 'denied', reason: 'tulip admission gate: policy requires denial' },
};

// Configurable, not hardcoded -- point at any tulip-compatible admission
// model. This example doesn't ship a model, just the integration pattern.
const GATE_SSH_HOST = process.env.TULIP_GATE_SSH_HOST ?? 'fedespark-lan';
const GATE_URL =
  process.env.TULIP_GATE_URL ?? 'http://127.0.0.1:8010/v1/chat/completions';
const GATE_MODEL = process.env.TULIP_GATE_MODEL ?? 'clusiana-admit-v4';

async function classifyCommand(command: string): Promise<ToolApprovalStatus> {
  const payload = JSON.stringify({
    model: GATE_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `POLICY:\n${POLICY}\n\nPROPOSED ACTION:\nrunCommand(command=${JSON.stringify(command)})\n\nVerdict?`,
      },
    ],
    max_tokens: 6,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  });
  const curlCmd = `curl -s -X POST ${GATE_URL} -H 'Content-Type: application/json' --data-binary @- --max-time 15`;

  try {
    const stdout = await runWithStdin(
      'ssh',
      ['-o', 'ConnectTimeout=5', GATE_SSH_HOST, curlCmd],
      payload,
      18_000,
    );
    const response = JSON.parse(stdout);
    const text = String(response.choices?.[0]?.message?.content ?? '').trim();
    const predicted = text.split(/\s+/)[0]?.replace(/[.,:]$/, '') ?? '';
    if (!(predicted in VERDICT_TO_STATUS)) {
      return 'user-approval'; // off-schema -- fail toward a human, not through
    }
    return VERDICT_TO_STATUS[predicted];
  } catch (err) {
    // Fail closed -- an unreachable gate must never become a silent
    // approval. 'user-approval' here means "don't decide alone", not
    // "escalate" -- the SDK's own round trip still asks a real human.
    return 'user-approval';
  }
}

run(async () => {
  const messages: ModelMessage[] = [];
  let approvals: ToolApprovalResponse[] = [];

  while (true) {
    messages.push(
      approvals.length > 0
        ? { role: 'tool', content: approvals }
        : { role: 'user', content: await terminal.question('You:\n') },
    );

    approvals = [];

    const result = await generateText({
      model: openai('gpt-5.4-mini'),
      instructions:
        'When a tool call was not approved by the user, ' +
        'do not retry the tool call with the same input. ' +
        'Just say that the tool execution was not approved.',
      tools: { runCommand: runCommandTool },
      toolApproval: {
        runCommand: ({ command }) => classifyCommand(command),
      },
      messages,
      stopWhen: isStepCount(5),
    });

    for (const step of result.steps) {
      for (const part of step.content) {
        switch (part.type) {
          case 'text': {
            process.stdout.write(`\nAssistant:\n`);
            process.stdout.write(part.text);
            break;
          }

          case 'tool-approval-request': {
            if (part.toolCall.toolName === 'runCommand' && !part.toolCall.dynamic) {
              const answer = await terminal.question(
                `\nTulip gate wants a human decision: run \`${part.toolCall.input.command}\` (y/n)?`,
              );
              approvals.push({
                type: 'tool-approval-response',
                approvalId: part.approvalId,
                approved: answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
              });
            }
            break;
          }

          case 'tool-approval-response': {
            if (part.toolCall.toolName === 'runCommand' && !part.toolCall.dynamic) {
              process.stdout.write(
                `\nrunCommand(${part.toolCall.input.command}) was ${
                  part.approved ? '\x1b[32mapproved\x1b[0m' : '\x1b[31mdenied\x1b[0m'
                } by the tulip admission gate.\n`,
              );
              if (part.reason != null) process.stdout.write(`Reason: ${part.reason}\n`);
            }
            break;
          }
        }
      }
    }

    process.stdout.write('\n\n');
    messages.push(...result.responseMessages);
  }
});
