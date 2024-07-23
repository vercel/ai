export type GoogleGenerativeAIPrompt = {
  systemInstruction?: GoogleGenerativeAISystemInstruction;
  contents: Array<GoogleGenerativeAIContent>;
};

export type GoogleGenerativeAISystemInstruction = {
  parts: Array<{ text: string }>;
};

export type GoogleGenerativeAIContent = {
  role: 'user' | 'model';
  parts: Array<GoogleGenerativeAIContentPart>;
};

export type GoogleGenerativeAIContentPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    }
  | {
      functionCall: {
        name: string;
        args: unknown;
      };
    }
  | {
      functionResponse: {
        name: string;
        response: unknown;
      };
    }
  | {
      fileData: {
        mimeType: string;
        fileUri: string;
      };
    };
