# Speech Generation Examples

This directory contains examples of generating speech from text using various providers.

## Providers

### OpenAI

- `openai.ts` - Basic text-to-speech generation
- `openai-voice.ts` - Using different voice options
- `openai-speed.ts` - Adjusting speech speed
- `openai-language.ts` - Language-specific generation
- `openai-instructions.ts` - Using instructions for speech style

### ElevenLabs

- `elevenlabs.ts` - Basic text-to-speech generation with ElevenLabs
- `elevenlabs-voice-settings.ts` - Advanced voice customization (stability, similarity, style)
- `elevenlabs-language.ts` - Multi-language support (74+ languages)
- `elevenlabs-flash.ts` - Ultra-low latency model (~75ms) for real-time applications
- `elevenlabs-turbo.ts` - Balanced quality and speed model
- `elevenlabs-output-format.ts` - Different audio format outputs (MP3, PCM, etc.)
- `elevenlabs-context.ts` - Using context for improved prosody
- `elevenlabs-test.ts` - Test script to verify integration setup

### LMNT

- `lmnt.ts` - Basic LMNT speech generation
- `lmnt-voice.ts` - LMNT voice selection
- `lmnt-speed.ts` - Speed control
- `lmnt-language.ts` - Language settings

### Hume

- `hume.ts` - Basic Hume speech generation
- `hume-voice.ts` - Voice selection
- `hume-speed.ts` - Speed adjustments
- `hume-language.ts` - Language configuration
- `hume-instructions.ts` - Custom instructions

### FAL

- `fal-basic.ts` - Basic FAL speech generation
- `fal-voice.ts` - Voice options
- `fal-dia.ts` - DIA voice model
- `fal-dia-voice-clone.ts` - Voice cloning with DIA
- `fal-chatterbox.ts` - Chatterbox model

### Azure

- `azure.ts` - Azure Speech Services integration

## Setup

### ElevenLabs Setup

1. Get your API key from [ElevenLabs](https://elevenlabs.io)
2. Get a voice ID from your ElevenLabs account
3. Set environment variables:
   ```bash
   ELEVENLABS_API_KEY=your_api_key
   ELEVENLABS_VOICE_ID=your_voice_id
   ```

### Running Examples

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build:packages

# Run an example
npx tsx src/generate-speech/elevenlabs.ts
```

## ElevenLabs Models

| Model                    | Description                      | Languages     | Latency   |
| ------------------------ | -------------------------------- | ------------- | --------- |
| `eleven_v3`              | Latest and most advanced model   | 74+ languages | Normal    |
| `eleven_multilingual_v2` | Most life-like, emotionally rich | Multiple      | Normal    |
| `eleven_flash_v2_5`      | Ultra-low latency (~75ms)        | 32 languages  | Ultra-low |
| `eleven_flash_v2`        | Ultra-low latency English        | English only  | Ultra-low |
| `eleven_turbo_v2_5`      | High-quality, low-latency        | 32 languages  | Low       |
| `eleven_turbo_v2`        | High-quality English             | English only  | Low       |

## Output

Generated audio files are saved to the `output/` directory with timestamps.
