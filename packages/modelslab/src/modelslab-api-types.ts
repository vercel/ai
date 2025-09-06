export interface ModelsLabTextToImageRequest {
  key: string;
  prompt: string;
  negative_prompt?: string;
  width?: string;
  height?: string;
  samples?: number;
  safety_checker?: boolean;
  seed?: number | null;
  instant_response?: boolean;
  base64?: boolean;
  webhook?: string | null;
  track_id?: string | null;
  enhance_prompt?: boolean;
}

export interface ModelsLabTextToImageResponse {
  status: 'success' | 'processing' | 'error';
  generationTime?: number;
  id?: number;
  output?: string[];
  proxy_links?: string[];
  future_links?: string[];
  meta?: {
    base64: string;
    enhance_prompt: string;
    file_prefix: string;
    guidance_scale: number;
    height: number;
    instant_response: string;
    n_samples: number;
    negative_prompt: string;
    outdir: string;
    prompt: string;
    safety_checker: string;
    safety_checker_type: string;
    seed: number;
    temp: string;
    width: number;
  };
  message?: string;
}
