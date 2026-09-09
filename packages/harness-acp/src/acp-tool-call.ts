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
  title: string;
  kind?: ACPToolKind;
  status?: ACPToolCallStatus;
  content?: Array<ACPToolCallContent>;
  locations?: Array<ACPToolCallLocation>;
  rawInput?: unknown;
  rawOutput?: unknown;
  _meta?: ACPMetadata | null;
};
