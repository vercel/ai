export type ApproachId = 'direct-tools' | 'code-mode';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolTrace = {
  id: number;
  toolName: string;
  input: JsonValue;
  output?: JsonValue;
  error?: string;
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type UsageSummary = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type ToolCallSummary = {
  toolCallId: string;
  toolName: string;
  input: JsonValue;
};

export type ToolResultSummary = {
  toolCallId: string;
  toolName: string;
  output: JsonValue;
};

export type ToolErrorSummary = {
  toolCallId: string;
  toolName: string;
  input: JsonValue;
  error: string;
};

export type StepSummary = {
  stepNumber: number;
  finishReason: string;
  text: string;
  usage: UsageSummary;
  performance: {
    stepTimeMs: number;
    responseTimeMs: number;
    toolExecutionMs: Record<string, number>;
  };
  toolCalls: ToolCallSummary[];
  toolResults: ToolResultSummary[];
  toolErrors: ToolErrorSummary[];
};

export type ToolDefinitionSummary = {
  name: string;
  description: string;
  inputSchema: JsonValue;
  outputSchema?: JsonValue;
};

export type RunInspection = {
  prompt: string;
  toolDefinitions: ToolDefinitionSummary[];
  generatedCode?: string;
};

export type ApproachResult = {
  id: ApproachId;
  label: string;
  model: string;
  totalMs: number;
  finalText: string;
  finishReason: string;
  usage: UsageSummary;
  inspection: RunInspection;
  steps: StepSummary[];
  hostToolTrace: ToolTrace[];
  metrics: {
    modelSteps: number;
    topLevelToolCalls: number;
    hostToolCalls: number;
    hostToolMs: number;
    modelResponseMs: number;
    toolExecutionMs: number;
  };
};

export type DiffPart = {
  type: 'equal' | 'added' | 'removed';
  value: string;
};

export type BenchmarkResponse = {
  caseId: string;
  model: string;
  prompt: string;
  runs: [ApproachResult, ApproachResult];
  diff: DiffPart[];
};

export type BenchmarkProgressEvent =
  | {
      type: 'benchmark-start';
      caseId: string;
      model: string;
      prompt: string;
    }
  | {
      type: 'approach-start';
      runId: ApproachId;
      label: string;
    }
  | {
      type: 'step-finish';
      runId: ApproachId;
      label: string;
      step: StepSummary;
      hostToolTrace: ToolTrace[];
    }
  | {
      type: 'approach-done';
      run: ApproachResult;
    }
  | {
      type: 'benchmark-done';
      result: BenchmarkResponse;
    }
  | {
      type: 'benchmark-error';
      error: string;
    };
