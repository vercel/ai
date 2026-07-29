import type { NormalizedCodeModeOptions, SerializableError } from '../types.js';

export interface WorkerRunMessage {
  type: 'run';
  invocationId: string;
  js: string;
  options: Pick<
    NormalizedCodeModeOptions,
    'timeoutMs' | 'memoryLimitBytes' | 'maxStackSizeBytes' | 'maxResultBytes'
  >;
}

export interface WorkerToolRequest {
  type: 'tool-request';
  invocationId: string;
  requestId: string;
  toolName: string;
  inputJson: string;
}

export interface WorkerBridgeResponse {
  type: 'bridge-response';
  invocationId: string;
  requestId: string;
  success: boolean;
  valueJson?: string;
  error?: SerializableError;
}

export interface WorkerResultMessage {
  type: 'result';
  invocationId: string;
  success: boolean;
  valueJson?: string;
  error?: SerializableError;
}

export interface WorkerReadyMessage {
  type: 'ready';
  invocationId: string;
}

export type WorkerToMainMessage =
  | WorkerToolRequest
  | WorkerResultMessage
  | WorkerReadyMessage;

export type MainToWorkerMessage = WorkerRunMessage | WorkerBridgeResponse;
