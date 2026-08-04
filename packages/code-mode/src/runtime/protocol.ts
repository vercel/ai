import type {
  CodeModeDeterminismState,
  NormalizedCodeModeOptions,
  SerializableError,
} from '../types.js';

export interface WorkerRunMessage {
  type: 'run';
  invocationId: string;
  js: string;
  determinism: CodeModeDeterminismState;
  options: Pick<
    NormalizedCodeModeOptions,
    | 'timeoutMs'
    | 'memoryLimitBytes'
    | 'maxStackSizeBytes'
    | 'maxResultBytes'
    | 'maxConsoleOutputBytes'
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
  dateNowMs: number;
  valueJson?: string;
  error?: SerializableError;
}

export interface WorkerBridgeDrainRequest {
  type: 'bridge-drain';
  invocationId: string;
  drainId: string;
}

export interface WorkerBridgeDrainedMessage {
  type: 'bridge-drained';
  invocationId: string;
  drainId: string;
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
  | WorkerBridgeDrainedMessage
  | WorkerResultMessage
  | WorkerReadyMessage;

export type MainToWorkerMessage =
  | WorkerRunMessage
  | WorkerBridgeResponse
  | WorkerBridgeDrainRequest;
