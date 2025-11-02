import type {UIMessage} from "ai";

export type MessageUIRole = "user" | "assistant" | "system";

// CUSTOM DATA (AI SDK `data-${NAME}`)

export interface DataCitationUIPart {
  title: string;
  url: string;
  description: string;
  number: number;
}

export type MessageUICustomData = {
  citation: DataCitationUIPart;
};

// METADATA
export interface FeedbackMetadata {
  liked: boolean;
  disliked: boolean;
  copied: boolean;
}

export interface TimestampMetadata {
  created_at: Date;
  updated_at: Date;
}

export interface MessageUIMetadata {
  timestamp: TimestampMetadata;
  feedback: FeedbackMetadata;
}

// CUSTOM TOOLS (AI SDK `tool-${NAME}`)

export interface GetCurrentWeatherInput {
  location: string;
}

export interface GetCurrentWeatherOutput {
  location: string;
  temperature: number;
  conditions?: string;
}

export type MessageUICustomTools = {
  get_current_weather: {
    input: GetCurrentWeatherInput;
    output: GetCurrentWeatherOutput;
  };
};

export type MessageUIPart = MessageUI["parts"][number];

export type MessageUI = UIMessage<
  MessageUIMetadata,
  MessageUICustomData,
  MessageUICustomTools
>;
