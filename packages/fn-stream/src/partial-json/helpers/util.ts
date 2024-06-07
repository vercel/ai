import type { StreamingParser } from '../parser';

export function internalGetStateRoot(parser: StreamingParser): any {
  // @ts-expect-error - Internal property.
  return parser.stateRoot;
}

export function internalGetRoot(parser: StreamingParser): any {
  // @ts-expect-error - Internal property.
  return parser.root;
}
