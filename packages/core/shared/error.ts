export interface ResponseErrorArgs {
  status?: number;
  statusText?: string;
  message: string;
}

export class ResponseError extends Error {
  name: string;
  message: string;
  status?: number;
  statusText?: string;

  constructor(response: Response, message: string) {
    super(message);
    const { status, statusText } = response;

    this.name = 'ResponseError';
    this.message = message;
    this.status = status;
    this.statusText = statusText;
  }
}
