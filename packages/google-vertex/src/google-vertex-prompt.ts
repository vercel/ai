export type GoogleVertexPrompt = Array<GoogleVertexContent>;

export type GoogleVertexContent = {
  role: 'user' | 'model';
  parts: Array<GoogleVertexContentPart>;
};

export type GoogleVertexContentPart =
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
