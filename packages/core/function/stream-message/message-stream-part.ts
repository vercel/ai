export type MessageStreamPart =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | {
      type: 'tool-call';
      id: string | null;
      name: string;
      args: unknown;
    }
  | {
      type: 'error';
      error: unknown;
    };
