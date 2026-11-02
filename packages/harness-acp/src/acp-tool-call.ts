export type ACPMetadata = Record<string, unknown>;

export type ACPRole = 'assistant' | 'user';

export type ACPAnnotations = {
  audience?: Array<ACPRole> | null;
  lastModified?: string | null;
  priority?: number | null;
  _meta?: ACPMetadata | null;
};

export type ACPTextContent = {
  annotations?: ACPAnnotations | null;
  text: string;
  _meta?: ACPMetadata | null;
};

export type ACPImageContent = {
  annotations?: ACPAnnotations | null;
  data: string;
  mimeType: string;
  uri?: string | null;
  _meta?: ACPMetadata | null;
};

export type ACPAudioContent = {
  annotations?: ACPAnnotations | null;
  data: string;
  mimeType: string;
  _meta?: ACPMetadata | null;
};

export type ACPResourceLink = {
  annotations?: ACPAnnotations | null;
  description?: string | null;
  mimeType?: string | null;
  name: string;
  size?: number | null;
  title?: string | null;
  uri: string;
  _meta?: ACPMetadata | null;
};

export type ACPTextResourceContents = {
  mimeType?: string | null;
  text: string;
  uri: string;
  _meta?: ACPMetadata | null;
};

export type ACPBlobResourceContents = {
  blob: string;
  mimeType?: string | null;
  uri: string;
  _meta?: ACPMetadata | null;
};

export type ACPEmbeddedResource = {
  annotations?: ACPAnnotations | null;
  resource: ACPTextResourceContents | ACPBlobResourceContents;
  _meta?: ACPMetadata | null;
};

export type ACPContentBlock =
  | (ACPTextContent & { type: 'text' })
  | (ACPImageContent & { type: 'image' })
  | (ACPAudioContent & { type: 'audio' })
  | (ACPResourceLink & { type: 'resource_link' })
  | (ACPEmbeddedResource & { type: 'resource' });

export type ACPToolCallContent =
  | {
      type: 'content';
      content: ACPContentBlock;
      _meta?: ACPMetadata | null;
    }
  | {
      type: 'diff';
      path: string;
      oldText?: string | null;
      newText: string;
      _meta?: ACPMetadata | null;
    }
  | {
      type: 'terminal';
      terminalId: string;
      _meta?: ACPMetadata | null;
    };

export type ACPToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other';

export type ACPToolCallStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type ACPToolCallLocation = {
  path: string;
  line?: number | null;
  _meta?: ACPMetadata | null;
};

export type ACPToolCall = {
  toolCallId: string;
  name?: string | null;
  title: string;
  kind?: ACPToolKind;
  status?: ACPToolCallStatus;
  content?: Array<ACPToolCallContent>;
  locations?: Array<ACPToolCallLocation>;
  rawInput?: unknown;
  rawOutput?: unknown;
  _meta?: ACPMetadata | null;
};

/**
 * A tool call from the ACP agent, resolved to one of the host tools that the
 * harness exposes through its own MCP server.
 */
export type ACPResolvedHostToolCall = {
  /**
   * Name of the host tool. Must be one of the `toolNames` passed to the
   * resolver.
   */
  readonly toolName: string;

  /**
   * Input for the host tool, with any agent-specific wrapper removed.
   */
  readonly input: Readonly<Record<string, unknown>>;
};

/**
 * Resolves an ACP tool call to the host tool it invokes.
 *
 * Called with the merged snapshot of all updates seen so far for a tool call,
 * and with standalone permission-request tool calls. Return `undefined` if the
 * tool call does not invoke a host tool, or cannot be resolved from the data
 * available so far.
 */
export type ACPResolveHostToolCall = (options: {
  readonly toolCall: ACPToolCall;
  readonly serverName: string;
  readonly toolNames: ReadonlyArray<string>;
}) => ACPResolvedHostToolCall | undefined;
