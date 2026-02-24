import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAIMetrics,
  recordRequestMetrics,
  recordStreamMetrics,
  recordToolCallMetrics,
  incrementActiveRequests,
  decrementActiveRequests,
} from './record-metrics';
import { noopMeter } from './noop-meter';

describe('createAIMetrics', () => {
  it('should create all metric instruments', () => {
    const ai_metrics = createAIMetrics(noopMeter);

    expect(ai_metrics.request_counter).toBeDefined();
    expect(ai_metrics.token_counter).toBeDefined();
    expect(ai_metrics.error_counter).toBeDefined();
    expect(ai_metrics.tool_call_counter).toBeDefined();
    expect(ai_metrics.duration_histogram).toBeDefined();
    expect(ai_metrics.time_to_first_token_histogram).toBeDefined();
    expect(ai_metrics.active_requests).toBeDefined();
  });
});

describe('recordRequestMetrics', () => {
  let mock_metrics: ReturnType<typeof createMockMetrics>;

  function createMockMetrics() {
    return {
      request_counter: { add: vi.fn() },
      token_counter: { add: vi.fn() },
      error_counter: { add: vi.fn() },
      tool_call_counter: { add: vi.fn() },
      duration_histogram: { record: vi.fn() },
      time_to_first_token_histogram: { record: vi.fn() },
      active_requests: { add: vi.fn() },
    };
  }

  beforeEach(() => {
    mock_metrics = createMockMetrics();
  });

  it('should record success metrics correctly', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    recordRequestMetrics(mock_metrics as any, attributes, {
      duration_ms: 1000,
      prompt_tokens: 100,
      completion_tokens: 50,
      success: true,
      finish_reason: 'stop',
    });

    expect(mock_metrics.request_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': true,
      'ai.response.finish_reason': 'stop',
    });

    expect(mock_metrics.duration_histogram.record).toHaveBeenCalledWith(1000, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': true,
      'ai.response.finish_reason': 'stop',
    });

    expect(mock_metrics.token_counter.add).toHaveBeenCalledWith(100, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': true,
      'ai.response.finish_reason': 'stop',
      'ai.token.type': 'prompt',
    });

    expect(mock_metrics.token_counter.add).toHaveBeenCalledWith(50, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': true,
      'ai.response.finish_reason': 'stop',
      'ai.token.type': 'completion',
    });

    expect(mock_metrics.error_counter.add).not.toHaveBeenCalled();
  });

  it('should record error metrics correctly', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    recordRequestMetrics(mock_metrics as any, attributes, {
      duration_ms: 500,
      prompt_tokens: 0,
      completion_tokens: 0,
      success: false,
    });

    expect(mock_metrics.request_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': false,
    });

    expect(mock_metrics.error_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': false,
    });
  });

  it('should not record tokens when count is zero', () => {
    recordRequestMetrics(mock_metrics as any, {}, {
      duration_ms: 100,
      prompt_tokens: 0,
      completion_tokens: 0,
      success: true,
    });

    expect(mock_metrics.token_counter.add).not.toHaveBeenCalled();
  });
});

describe('recordStreamMetrics', () => {
  let mock_metrics: ReturnType<typeof createMockMetrics>;

  function createMockMetrics() {
    return {
      request_counter: { add: vi.fn() },
      token_counter: { add: vi.fn() },
      error_counter: { add: vi.fn() },
      tool_call_counter: { add: vi.fn() },
      duration_histogram: { record: vi.fn() },
      time_to_first_token_histogram: { record: vi.fn() },
      active_requests: { add: vi.fn() },
    };
  }

  beforeEach(() => {
    mock_metrics = createMockMetrics();
  });

  it('should record time to first token when provided', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    recordStreamMetrics(mock_metrics as any, attributes, {
      duration_ms: 2000,
      prompt_tokens: 100,
      completion_tokens: 200,
      success: true,
      finish_reason: 'stop',
      time_to_first_token_ms: 150,
    });

    expect(mock_metrics.time_to_first_token_histogram.record).toHaveBeenCalledWith(150, {
      'ai.model.id': 'gpt-4',
      'ai.request.success': true,
    });

    // Also verify base metrics are recorded
    expect(mock_metrics.request_counter.add).toHaveBeenCalled();
    expect(mock_metrics.duration_histogram.record).toHaveBeenCalled();
  });

  it('should not record time to first token when undefined', () => {
    recordStreamMetrics(mock_metrics as any, {}, {
      duration_ms: 1000,
      prompt_tokens: 50,
      completion_tokens: 100,
      success: true,
    });

    expect(mock_metrics.time_to_first_token_histogram.record).not.toHaveBeenCalled();
  });

  it('should not record time to first token when zero', () => {
    recordStreamMetrics(mock_metrics as any, {}, {
      duration_ms: 1000,
      prompt_tokens: 50,
      completion_tokens: 100,
      success: true,
      time_to_first_token_ms: 0,
    });

    expect(mock_metrics.time_to_first_token_histogram.record).not.toHaveBeenCalled();
  });
});

describe('recordToolCallMetrics', () => {
  let mock_metrics: ReturnType<typeof createMockMetrics>;

  function createMockMetrics() {
    return {
      request_counter: { add: vi.fn() },
      token_counter: { add: vi.fn() },
      error_counter: { add: vi.fn() },
      tool_call_counter: { add: vi.fn() },
      duration_histogram: { record: vi.fn() },
      time_to_first_token_histogram: { record: vi.fn() },
      active_requests: { add: vi.fn() },
    };
  }

  beforeEach(() => {
    mock_metrics = createMockMetrics();
  });

  it('should record successful tool call', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    recordToolCallMetrics(mock_metrics as any, attributes, {
      tool_name: 'search',
      success: true,
    });

    expect(mock_metrics.tool_call_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.tool_call.name': 'search',
      'ai.tool_call.success': true,
    });

    expect(mock_metrics.error_counter.add).not.toHaveBeenCalled();
  });

  it('should record failed tool call with error', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    recordToolCallMetrics(mock_metrics as any, attributes, {
      tool_name: 'calculator',
      success: false,
    });

    expect(mock_metrics.tool_call_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.tool_call.name': 'calculator',
      'ai.tool_call.success': false,
    });

    expect(mock_metrics.error_counter.add).toHaveBeenCalledWith(1, {
      'ai.model.id': 'gpt-4',
      'ai.tool_call.name': 'calculator',
      'ai.tool_call.success': false,
      'ai.error.type': 'tool_call',
    });
  });
});

describe('active requests tracking', () => {
  let mock_metrics: ReturnType<typeof createMockMetrics>;

  function createMockMetrics() {
    return {
      request_counter: { add: vi.fn() },
      token_counter: { add: vi.fn() },
      error_counter: { add: vi.fn() },
      tool_call_counter: { add: vi.fn() },
      duration_histogram: { record: vi.fn() },
      time_to_first_token_histogram: { record: vi.fn() },
      active_requests: { add: vi.fn() },
    };
  }

  beforeEach(() => {
    mock_metrics = createMockMetrics();
  });

  it('should increment active requests', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    incrementActiveRequests(mock_metrics as any, attributes);

    expect(mock_metrics.active_requests.add).toHaveBeenCalledWith(1, attributes);
  });

  it('should decrement active requests', () => {
    const attributes = { 'ai.model.id': 'gpt-4' };

    decrementActiveRequests(mock_metrics as any, attributes);

    expect(mock_metrics.active_requests.add).toHaveBeenCalledWith(-1, attributes);
  });
});
