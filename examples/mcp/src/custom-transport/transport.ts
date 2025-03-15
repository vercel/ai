import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types';
import * as readline from 'readline';

export class CustomClientTransport {
  private childProcess: import('child_process').ChildProcess;
  private lineReader: readline.Interface;

  public onMessage?: (message: JSONRPCMessage) => void;
  public onClose?: () => void;
  public onError?: (error: Error) => void;

  constructor(options: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    debug?: boolean;
  }) {
    const { spawn } = require('child_process');

    this.childProcess = spawn(options.command, options.args || [], {
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stdin = this.childProcess.stdin;
    const stdout = this.childProcess.stdout;
    const stderr = this.childProcess.stderr;

    if (!stdin || !stdout || !stderr) {
      throw new Error(
        'Child process stdin, stdout, or stderr is not available',
      );
    }

    stdin.setDefaultEncoding('utf8');

    this.lineReader = readline.createInterface({
      input: stdout,
      crlfDelay: Infinity,
    });

    stderr.on('data', (data: Buffer) => {
      const stderr = data.toString();
      console.error(`[MCP Server] ${stderr}`);
    });

    this.childProcess.on('exit', (code: number, signal: string) => {
      if (code !== 0 && code !== null) {
        this.onError?.(new Error(`Child process exited with code ${code}`));
      }
      this.onClose?.();
    });

    stdout.on('error', err => {
      this.onError?.(new Error(`stdout error: ${err.message}`));
    });

    stdin.on('error', err => {
      this.onError?.(new Error(`stdin error: ${err.message}`));
    });
  }

  async start(): Promise<void> {
    return new Promise(resolve => {
      this.lineReader.on('line', line => {
        if (line.trim() === '') return;

        try {
          const message = JSON.parse(line) as JSONRPCMessage;
          this.onMessage?.(message);
        } catch (error) {
          this.onError?.(new Error(`Failed to parse message: ${error}`));
        }
      });

      resolve();
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const messageStr = JSON.stringify(message) + '\n';

      if (this.childProcess.killed) {
        reject(new Error('Child process has been killed'));
        return;
      }

      if (!this.childProcess.stdin) {
        reject(new Error('Child process stdin is not available'));
        return;
      }

      this.childProcess.stdin.write(messageStr, error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    this.lineReader.close();

    if (this.childProcess && !this.childProcess.killed) {
      return new Promise(resolve => {
        const forceKillTimeout = setTimeout(() => {
          if (!this.childProcess.killed) {
            this.childProcess.kill('SIGKILL');
          }
          resolve();
        }, 1000);

        this.childProcess.once('exit', () => {
          clearTimeout(forceKillTimeout);
          resolve();
        });

        if (this.childProcess.stdin) {
          this.childProcess.stdin.end();
        }

        this.childProcess.kill('SIGTERM');
      });
    }

    return Promise.resolve();
  }
}
