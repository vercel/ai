export type CambaiTranscriptionResponseItem = {
  start: number;
  end: number;
  text: string;
  speaker: string;
};

export type CambaiTaskStatusResponse = {
  status: string;
  message?: string;
  run_id?: number;
};
