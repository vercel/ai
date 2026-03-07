export type CambSpeechAPITypes = {
  text: string;
  voice_id: number;
  speech_model?: string;
  language: string;
  speed?: number;
  age?: number;
  gender?: 'male' | 'female';
  accent?: string;
};
