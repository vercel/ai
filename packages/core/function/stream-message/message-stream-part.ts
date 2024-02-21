export type MessageStreamPart =
  | {
      type: 'text-delta';
      textDelta: string;
    }
  | {
      type: 'error';
      error: unknown;
    };
