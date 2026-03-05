export type CambaiSpeechAPITypes = {
  text: string;
  language: string;
  voice_id: number;
  speech_model?: string;
  user_instructions?: string | null;
  enhance_named_entities_pronunciation?: boolean;
  output_configuration?: {
    format?: string;
    duration?: number;
    apply_enhancement?: boolean;
  };
  voice_settings?: {
    enhance_reference_audio_quality?: boolean;
    maintain_source_accent?: boolean;
    apply_ref_loudness_norm?: boolean;
  };
  inference_options?: {
    stability?: number;
    temperature?: number;
    inference_steps?: number;
    speaker_similarity?: number;
    localize_speaker_weight?: number;
    acoustic_quality_boost?: boolean;
  };
};
