/**
 * Internal TypeScript types for the Gemini Interactions API wire format.
 *
 * Mirrors the public types in `googleapis/js-genai`:
 * `src/interactions/resources/interactions.ts`. Kept minimal for TASK-1 (text +
 * thought happy path); further content/tool block variants are scaffolded as
 * `unknown` here and populated in subsequent tasks.
 */

export type GoogleInteractionsTextContent = {
  type: 'text';
  text: string;
  annotations?: Array<unknown>;
};

export type GoogleInteractionsImageContent = {
  type: 'image';
  data?: string;
  mime_type?: string;
  uri?: string;
  resolution?: 'low' | 'medium' | 'high' | 'ultra_high';
};

export type GoogleInteractionsAudioContent = {
  type: 'audio';
  data?: string;
  mime_type?: string;
  uri?: string;
  channels?: number;
  sample_rate?: number;
};

export type GoogleInteractionsDocumentContent = {
  type: 'document';
  data?: string;
  mime_type?: string;
  uri?: string;
};

export type GoogleInteractionsVideoContent = {
  type: 'video';
  data?: string;
  mime_type?: string;
  uri?: string;
  resolution?: 'low' | 'medium' | 'high' | 'ultra_high';
};

export type GoogleInteractionsThoughtSummaryItem =
  | GoogleInteractionsTextContent
  | GoogleInteractionsImageContent;

export type GoogleInteractionsThoughtContent = {
  type: 'thought';
  signature?: string;
  summary?: Array<GoogleInteractionsThoughtSummaryItem>;
};

export type GoogleInteractionsFunctionCallContent = {
  type: 'function_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  signature?: string;
};

export type GoogleInteractionsFunctionResultContent = {
  type: 'function_result';
  call_id: string;
  result:
    | string
    | Array<GoogleInteractionsTextContent | GoogleInteractionsImageContent>
    | unknown;
  name?: string;
  is_error?: boolean;
  signature?: string;
};

/**
 * URL citation annotation for `text` content blocks.
 * Mirrors `Annotation.URLCitation` in `googleapis/js-genai`
 * `src/interactions/resources/interactions.ts`.
 */
export type GoogleInteractionsURLCitation = {
  type: 'url_citation';
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
};

/**
 * File citation annotation for `text` content blocks.
 */
export type GoogleInteractionsFileCitation = {
  type: 'file_citation';
  file_name?: string;
  document_uri?: string;
  source?: string;
  page_number?: number;
  media_id?: string;
  start_index?: number;
  end_index?: number;
  custom_metadata?: Record<string, unknown>;
};

/**
 * Place citation annotation for Google Maps grounding.
 */
export type GoogleInteractionsPlaceCitation = {
  type: 'place_citation';
  name?: string;
  url?: string;
  place_id?: string;
  start_index?: number;
  end_index?: number;
  review_snippets?: Array<{
    review_id?: string;
    title?: string;
    url?: string;
  }>;
};

export type GoogleInteractionsAnnotation =
  | GoogleInteractionsURLCitation
  | GoogleInteractionsFileCitation
  | GoogleInteractionsPlaceCitation;

/**
 * Built-in tool call content blocks. The Interactions API exposes server-side
 * tool invocations via paired `*_call`/`*_result` blocks (as opposed to
 * `function_call`/`function_result` for client-executed tools).
 */
export type GoogleInteractionsCodeExecutionCallContent = {
  type: 'code_execution_call';
  id: string;
  arguments?: { code?: string; language?: string };
  signature?: string;
};

export type GoogleInteractionsCodeExecutionResultContent = {
  type: 'code_execution_result';
  call_id: string;
  result?: string;
  is_error?: boolean;
  signature?: string;
};

export type GoogleInteractionsURLContextCallContent = {
  type: 'url_context_call';
  id: string;
  arguments?: { urls?: Array<string> };
  signature?: string;
};

export type GoogleInteractionsURLContextResultEntry = {
  url?: string;
  status?: 'success' | 'error' | 'paywall' | 'unsafe' | string;
};

export type GoogleInteractionsURLContextResultContent = {
  type: 'url_context_result';
  call_id: string;
  result?: Array<GoogleInteractionsURLContextResultEntry>;
  is_error?: boolean;
  signature?: string;
};

export type GoogleInteractionsGoogleSearchCallContent = {
  type: 'google_search_call';
  id: string;
  arguments?: { queries?: Array<string> };
  search_type?: 'web_search' | 'image_search' | 'enterprise_web_search';
  signature?: string;
};

export type GoogleInteractionsGoogleSearchResultEntry = {
  search_suggestions?: string;
  url?: string;
  title?: string;
};

export type GoogleInteractionsGoogleSearchResultContent = {
  type: 'google_search_result';
  call_id: string;
  result?: Array<GoogleInteractionsGoogleSearchResultEntry>;
  is_error?: boolean;
  signature?: string;
};

export type GoogleInteractionsFileSearchCallContent = {
  type: 'file_search_call';
  id: string;
  signature?: string;
};

export type GoogleInteractionsFileSearchResultEntry = {
  file_name?: string;
  document_uri?: string;
  title?: string;
  source?: string;
};

export type GoogleInteractionsFileSearchResultContent = {
  type: 'file_search_result';
  call_id: string;
  result?: Array<unknown>;
  signature?: string;
};

export type GoogleInteractionsGoogleMapsCallContent = {
  type: 'google_maps_call';
  id: string;
  arguments?: { queries?: Array<string> };
  signature?: string;
};

export type GoogleInteractionsGoogleMapsResultPlace = {
  name?: string;
  place_id?: string;
  url?: string;
  review_snippets?: Array<{
    review_id?: string;
    title?: string;
    url?: string;
  }>;
};

export type GoogleInteractionsGoogleMapsResultEntry = {
  places?: Array<GoogleInteractionsGoogleMapsResultPlace>;
  widget_context_token?: string;
};

export type GoogleInteractionsGoogleMapsResultContent = {
  type: 'google_maps_result';
  call_id: string;
  result?: Array<GoogleInteractionsGoogleMapsResultEntry>;
  signature?: string;
};

export type GoogleInteractionsMCPServerToolCallContent = {
  type: 'mcp_server_tool_call';
  id: string;
  name: string;
  server_name: string;
  arguments?: Record<string, unknown>;
  signature?: string;
};

export type GoogleInteractionsMCPServerToolResultContent = {
  type: 'mcp_server_tool_result';
  call_id: string;
  result?: unknown;
  name?: string;
  server_name?: string;
  signature?: string;
};

export type GoogleInteractionsBuiltinToolCallContent =
  | GoogleInteractionsCodeExecutionCallContent
  | GoogleInteractionsURLContextCallContent
  | GoogleInteractionsGoogleSearchCallContent
  | GoogleInteractionsFileSearchCallContent
  | GoogleInteractionsGoogleMapsCallContent
  | GoogleInteractionsMCPServerToolCallContent;

export type GoogleInteractionsBuiltinToolResultContent =
  | GoogleInteractionsCodeExecutionResultContent
  | GoogleInteractionsURLContextResultContent
  | GoogleInteractionsGoogleSearchResultContent
  | GoogleInteractionsFileSearchResultContent
  | GoogleInteractionsGoogleMapsResultContent
  | GoogleInteractionsMCPServerToolResultContent;

/**
 * Discriminated union of every content block kind the API supports. For
 * TASK-1, only `text` and `thought` are exercised end-to-end; the remaining
 * variants are listed for type completeness so subsequent tasks can extend the
 * parser/converter without widening the type.
 */
export type GoogleInteractionsContent =
  | GoogleInteractionsTextContent
  | GoogleInteractionsImageContent
  | GoogleInteractionsAudioContent
  | GoogleInteractionsDocumentContent
  | GoogleInteractionsVideoContent
  | GoogleInteractionsThoughtContent
  | GoogleInteractionsFunctionCallContent
  | GoogleInteractionsFunctionResultContent
  | { type: string; [k: string]: unknown };

export type GoogleInteractionsTurn = {
  role: 'user' | 'model' | string;
  content?: string | Array<GoogleInteractionsContent>;
};

export type GoogleInteractionsInput =
  | string
  | GoogleInteractionsContent
  | Array<GoogleInteractionsContent>
  | Array<GoogleInteractionsTurn>;

export type GoogleInteractionsTool =
  | {
      type: 'function';
      name?: string;
      description?: string;
      parameters?: unknown;
    }
  | { type: 'code_execution' }
  | { type: 'url_context' }
  | {
      type: 'computer_use';
      environment?: 'browser';
      excludedPredefinedFunctions?: Array<string>;
    }
  | {
      type: 'mcp_server';
      name?: string;
      url?: string;
      headers?: Record<string, string>;
      allowed_tools?: Array<unknown>;
    }
  | {
      type: 'google_search';
      search_types?: Array<
        'web_search' | 'image_search' | 'enterprise_web_search'
      >;
    }
  | {
      type: 'file_search';
      file_search_store_names?: Array<string>;
      metadata_filter?: string;
      top_k?: number;
    }
  | {
      type: 'google_maps';
      enable_widget?: boolean;
      latitude?: number;
      longitude?: number;
    }
  | {
      type: 'retrieval';
      retrieval_types?: Array<'vertex_ai_search'>;
      vertex_ai_search_config?: {
        datastores?: Array<string>;
        engine?: string;
      };
    };

export type GoogleInteractionsToolChoiceType =
  | 'auto'
  | 'any'
  | 'none'
  | 'validated';

export type GoogleInteractionsAllowedToolsConfig = {
  allowed_tools?: {
    mode?: GoogleInteractionsToolChoiceType;
    tools?: Array<string>;
  };
};

export type GoogleInteractionsToolChoice =
  | GoogleInteractionsToolChoiceType
  | GoogleInteractionsAllowedToolsConfig;

export type GoogleInteractionsThinkingLevel =
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high';

export type GoogleInteractionsThinkingSummaries = 'auto' | 'none';

export type GoogleInteractionsResponseModality =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document';

export type GoogleInteractionsServiceTier = 'flex' | 'standard' | 'priority';

export type GoogleInteractionsImageConfig = {
  aspect_ratio?:
    | '1:1'
    | '2:3'
    | '3:2'
    | '3:4'
    | '4:3'
    | '4:5'
    | '5:4'
    | '9:16'
    | '16:9'
    | '21:9'
    | '1:8'
    | '8:1'
    | '1:4'
    | '4:1';
  image_size?: '1K' | '2K' | '4K' | '512';
};

export type GoogleInteractionsGenerationConfig = {
  temperature?: number;
  top_p?: number;
  seed?: number;
  stop_sequences?: Array<string>;
  max_output_tokens?: number;
  thinking_level?: GoogleInteractionsThinkingLevel;
  thinking_summaries?: GoogleInteractionsThinkingSummaries;
  image_config?: GoogleInteractionsImageConfig;
  tool_choice?: GoogleInteractionsToolChoice;
};

export type GoogleInteractionsAgentConfig =
  | { type: 'dynamic'; [k: string]: unknown }
  | {
      type: 'deep-research';
      thinking_summaries?: GoogleInteractionsThinkingSummaries;
      visualization?: 'off' | 'auto';
      collaborative_planning?: boolean;
    };

export type GoogleInteractionsRequestBody = {
  model?: string;
  agent?: string;
  input: GoogleInteractionsInput;
  system_instruction?: string;
  tools?: Array<GoogleInteractionsTool>;
  response_format?: unknown;
  response_mime_type?: string;
  response_modalities?: Array<GoogleInteractionsResponseModality>;
  generation_config?: GoogleInteractionsGenerationConfig;
  agent_config?: GoogleInteractionsAgentConfig;
  previous_interaction_id?: string;
  service_tier?: GoogleInteractionsServiceTier;
  store?: boolean;
  stream?: boolean;
  /**
   * Run the interaction in the background. The POST returns immediately with a
   * non-terminal status (`in_progress` / `requires_action`); the client must
   * poll `GET /interactions/{id}` until terminal.
   *
   * Required for agent calls -- the API returns
   * `background=true is required for agent interactions.` otherwise. Not used
   * for model-id calls.
   */
  background?: boolean;
};

export type GoogleInteractionsStatus =
  | 'in_progress'
  | 'requires_action'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'incomplete';
