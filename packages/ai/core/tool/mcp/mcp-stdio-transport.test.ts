import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { StdioClientTransport } from './mcp-stdio-transport';
import { MCPClientError } from '../../../errors';
import { JSONRPCMessage } from './types';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

interface MockProcess {
  stdin: EventEmitter & { write?: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  on: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
}

// THIS IS NOT WORKING NEED TO FIX
describe.todo('MCPStdIOTransport', () => {
  let transport: StdioClientTransport;
  let mockProcess: MockProcess;
  let mockStdin: EventEmitter & { write?: ReturnType<typeof vi.fn> };
  let mockStdout: EventEmitter;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStdin = new EventEmitter();
    mockStdout = new EventEmitter();
    mockProcess = {
      stdin: mockStdin,
      stdout: mockStdout,
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    vi.mocked(require('node:child_process').spawn).mockReturnValue(
      mockProcess as unknown as ChildProcess,
    );

    transport = new StdioClientTransport({
      command: 'test-command',
      args: ['--test'],
      type: 'stdio',
    });
  });

  describe('start', () => {
    it('should successfully start the transport', async () => {
      const startPromise = transport.start();

      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );

      await expect(startPromise).resolves.toBeUndefined();
    });

    it('should throw error if already started', async () => {
      // Start once
      const firstStart = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await firstStart;

      // Try to start again
      await expect(transport.start()).rejects.toThrow(MCPClientError);
    });

    it('should handle spawn errors', async () => {
      const error = new Error('Spawn failed');
      const startPromise = transport.start();

      mockProcess.on.mockImplementation(
        (event: string, callback: (err: Error) => void) => {
          if (event === 'error') {
            callback(error);
          }
        },
      );

      await expect(startPromise).rejects.toThrow('Spawn failed');
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      const startPromise = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await startPromise;
    });

    it('should successfully send a message', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      mockStdin.write = vi.fn().mockReturnValue(true);

      await transport.send(message);

      expect(mockStdin.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
      );
    });

    it('should handle write backpressure', async () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      mockStdin.write = vi.fn().mockReturnValue(false);

      const sendPromise = transport.send(message);

      mockStdin.emit('drain');

      await expect(sendPromise).resolves.toBeUndefined();
    });

    it('should throw error if transport is not connected', async () => {
      await transport.close();

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      await expect(transport.send(message)).rejects.toThrow(MCPClientError);
    });
  });

  describe('message handling', () => {
    it('should handle incoming messages correctly', async () => {
      const onMessage = vi.fn();
      transport.onMessage = onMessage;

      const startPromise = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await startPromise;

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      mockStdout.emit('data', Buffer.from(JSON.stringify(message) + '\n'));

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle partial messages correctly', async () => {
      const onMessage = vi.fn();
      transport.onMessage = onMessage;

      const startPromise = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await startPromise;

      const message = {
        jsonrpc: '2.0',
        id: '1',
        method: 'test',
        params: {},
      };

      const messageStr = JSON.stringify(message);
      mockStdout.emit('data', Buffer.from(messageStr.slice(0, 10)));
      mockStdout.emit('data', Buffer.from(messageStr.slice(10) + '\n'));

      expect(onMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('close', () => {
    it('should close the transport successfully', async () => {
      const startPromise = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await startPromise;

      await transport.close();

      expect(mockProcess.on).toHaveBeenCalledWith(
        'close',
        expect.any(Function),
      );
    });

    it('should handle onClose callback', async () => {
      const onClose = vi.fn();
      transport.onClose = onClose;

      const startPromise = transport.start();
      mockProcess.on.mockImplementation(
        (event: string, callback: () => void) => {
          if (event === 'spawn') {
            callback();
          }
        },
      );
      await startPromise;

      mockProcess.on.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        },
      );

      await transport.close();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
