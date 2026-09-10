import type { RealtimeServerEvent } from '../types/realtime-model';

export type RealtimeSessionState = {
  delegationMode?: 'client' | 'provider';
  sessionId?: string;
  transcripts: Extract<RealtimeServerEvent, { type: 'transcript-fragment' }>[];
  delegations: Extract<RealtimeServerEvent, { type: 'delegation-created' }>[];
  backendUsage?: Extract<
    RealtimeServerEvent,
    { type: 'backend-response-done' }
  >[];
  usage?: { seconds: number };
  finalization: 'pending' | 'confirmed' | 'unconfirmed';
  terminationReason?: string;
  isInputMuted: boolean;
};

export function createSessionState(): RealtimeSessionState {
  return {
    transcripts: [],
    delegations: [],
    isInputMuted: false,
    finalization: 'pending',
  };
}

export function reduceSessionState(
  state: RealtimeSessionState,
  event: RealtimeServerEvent,
  limit: number,
  muted?: boolean,
): RealtimeSessionState {
  switch (event.type) {
    case 'session-started':
      return {
        ...state,
        sessionId: event.sessionId,
        delegationMode: event.delegationMode,
      };
    case 'session-usage':
      return { ...state, usage: event.usage };
    case 'session-closed':
      return {
        ...state,
        sessionId: event.sessionId ?? state.sessionId,
        usage: event.usage,
        terminationReason: event.reason,
        finalization: 'confirmed',
      };
    case 'transcript-fragment':
      return {
        ...state,
        transcripts: [...state.transcripts, event].slice(-limit),
      };
    case 'delegation-created':
      return state.delegations.some(
        item => item.delegationId === event.delegationId,
      )
        ? state
        : {
            ...state,
            delegations: [...state.delegations, event].slice(-limit),
          };
    case 'backend-response-done':
      return event.usage == null ||
        state.backendUsage?.some(item => item.responseId === event.responseId)
        ? state
        : {
            ...state,
            backendUsage: [...(state.backendUsage ?? []), event].slice(-limit),
          };
    case 'command-acknowledged':
      return muted == null ? state : { ...state, isInputMuted: muted };
    default:
      return state;
  }
}
