import type {
  AI302ImageModelId,
  AI302ImageSettings,
} from '../ai302-image-settings';
import { AuraflowHandler } from './auraflow';
import { BagelHandler } from './bagel';
import type { BaseModelHandler } from './base-model';
import { CogViewHandler } from './cogview';
import { DallEHandler } from './dalle';
import { FluxProDevHandler } from './flux-pro-dev';
import { FluxKreaHandler } from './flux-1-krea';
import { FluxKontextHandler } from './flux-kontext';
import { GPTImageHandler } from './gpt-image';
import { HidreamHandler } from './hidream';
import { IdeogramHandler, IdeogramV3Handler } from './ideogram';
import { IRAGHandler } from './irag';
import { KlingHandler } from './kling';
import { KolorsHandler } from './kolors';
import { LumaPhotonHandler } from './luma-photon';
import { MidjourneyHandler } from './midjourney';
import { MinimaxHandler } from './minimax';
import { RecraftHandler } from './recraft';
import { SD3V2Handler } from './sd3v2';
import { SD3UltraHandler } from './sd3-ultra';
import { SDXLHandler } from './sdxl';
import { SDXLLightningHandler } from './sdxl-lightning';
import { SoulHandler } from './soul';
import { AI302Config } from '../ai302-config';
import { SD35Handler } from './sd35';
import { GoogleImagen3Handler } from './google-imagen-3';
import { GoogleImagen4Handler } from './google-imagen-4';
import { DoubaoHandler } from './doubao';
import { DoubaoSeedreamHandler } from './doubao-seedream';
import { LuminaImageHandler } from './lumina-image';
import { OmnigenHandler } from './omnigen';
import { PlaygroundHandler } from './playground';
import { QwenImageHandler } from './qwen-image';
import { Gemini25FlashImagePreviewHandler } from './gemini-2.5-flash-image-preview';

export function createImageModelHandler(
  modelId: AI302ImageModelId,
  settings: AI302ImageSettings,
  config: AI302Config,
): BaseModelHandler {
  switch (modelId) {
    case 'aura-flow':
      return new AuraflowHandler(modelId, settings, config);
    case 'dall-e-3':
      return new DallEHandler(modelId, settings, config);
    case 'flux-v1.1-ultra':
    case 'flux-pro-v1.1':
    case 'flux-pro':
    case 'flux-dev':
    case 'flux-schnell':
      return new FluxProDevHandler(modelId, settings, config);
    case 'flux-1-krea':
      return new FluxKreaHandler(modelId, settings, config);
    case 'flux-kontext-max':
    case 'flux-kontext-pro':
      return new FluxKontextHandler(modelId, settings, config);
    case 'ideogram/V_1':
    case 'ideogram/V_1_TURBO':
    case 'ideogram/V_2':
    case 'ideogram/V_2_TURBO':
    case 'ideogram/V_2A':
    case 'ideogram/V_2A_TURBO':
      return new IdeogramHandler(modelId, settings, config);
    case 'ideogram/V_3_TURBO':
    case 'ideogram/V_3_DEFAULT':
    case 'ideogram/V_3_QUALITY':
      return new IdeogramV3Handler(modelId, settings, config);
    case 'recraftv3':
    case 'recraftv2':
      return new RecraftHandler(modelId, settings, config);
    case 'sdxl-lightning':
    case 'sdxl-lightning-v2':
    case 'sdxl-lightning-v3':
      return new SDXLLightningHandler(modelId, settings, config);
    case 'kling-v1':
    case 'kling-v1-5':
    case 'kling-v2':
    case 'kling-v2-1':
      return new KlingHandler(modelId, settings, config);
    case 'kolors':
      return new KolorsHandler(modelId, settings, config);
    case 'photon-flash-1':
    case 'photon-1':
      return new LumaPhotonHandler(modelId, settings, config);
    case 'sdxl':
      return new SDXLHandler(modelId, settings, config);
    case 'sd3-ultra':
      return new SD3UltraHandler(modelId, settings, config);
    case 'sd3v2':
      return new SD3V2Handler(modelId, settings, config);
    case 'sd3.5-large':
    case 'sd3.5-large-turbo':
    case 'sd3.5-medium':
      return new SD35Handler(modelId, settings, config);
    case 'midjourney/6.0':
    case 'midjourney/6.1':
    case 'midjourney/7.0':
    case 'nijijourney/6.0':
      return new MidjourneyHandler(modelId, settings, config);
    case 'google-imagen-3':
    case 'google-imagen-3-fast':
      return new GoogleImagen3Handler(modelId, settings, config);
    case 'google-imagen-4-preview':
      return new GoogleImagen4Handler(modelId, settings, config);
    case 'doubao-general-v2.1-l':
    case 'doubao-general-v2.0-l':
    case 'doubao-general-v2.0':
    case 'doubao-general-v3.0':
      return new DoubaoHandler(modelId, settings, config);
    case 'doubao-seedream-3-0-t2i-250415':
    case 'doubao-seedream-4-0-250828':
      return new DoubaoSeedreamHandler(modelId, settings, config);
    case 'lumina-image-v2':
      return new LuminaImageHandler(modelId, settings, config);
    case 'omnigen-v1':
      return new OmnigenHandler(modelId, settings, config);
    case 'playground-v25':
      return new PlaygroundHandler(modelId, settings, config);
    case 'cogview-4':
    case 'cogview-4-250304':
      return new CogViewHandler(modelId, settings, config);
    case 'minimaxi-image-01':
      return new MinimaxHandler(modelId, settings, config);
    case 'irag-1.0':
      return new IRAGHandler(modelId, settings, config);
    case 'hidream-i1-full':
    case 'hidream-i1-dev':
    case 'hidream-i1-fast':
      return new HidreamHandler(modelId, settings, config);
    case 'gpt-image-1':
      return new GPTImageHandler(modelId, settings, config);
    case 'bagel':
      return new BagelHandler(modelId, settings, config);
    case 'soul':
      return new SoulHandler(modelId, settings, config);
    case 'qwen-image':
      return new QwenImageHandler(modelId, settings, config);
    case 'gemini-2.5-flash-image-preview':
      return new Gemini25FlashImagePreviewHandler(modelId, settings, config);
    default:
      throw new Error(`Unsupported model: ${modelId}`);
  }
}
