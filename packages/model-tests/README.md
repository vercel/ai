# AI SDK - Model Capabilities Tests

The **Model Capabilities Tests** module contains a standardized test suite for validating AI models against a common set of capabilities and behaviors.

## Overview

The test framework consists of:

1. A core test suite generator that runs standardized tests across different capabilities e.g.:

   - Text generation
   - Object generation
   - Tool usage
   - Search grounding
   - Embeddings
   - Image generation

2. Model-specific test implementations that configure and customize the test suite for each provider and model's unique characteristics.

## Data-Driven Testing

The framework uses a data-driven approach for running and tracking capability tests:

### Configuration

- Define model capabilities in `etc/model-capabilities.json`:

```json
{
  "models": [
    {
      "provider": "openai",
      "modelId": "gpt-4-turbo-preview",
      "expectedCapabilities": [
        "textCompletion",
        "imageInput",
        "objectGeneration"
      ]
    }
  ]
}
```

### Running Tests

```bash
pnpm run test:capabilities
```

### Results

Test results are stored as JSON files in the `results` directory:

- Files are stored as: `<provider>/<model-type>/<model-id>.json` (e.g. `openai/chat/gpt-4-turbo-preview.json`)
- Each file contains a machine-readable JSON object with test results
- Results include pass/fail status and error details for each capability
- Format enables easy parsing and analysis for reporting

Example result:

```json
{
  "provider": "openai",
  "modelId": "gpt-4-turbo-preview",
  "timestamp": "2024-03-20T10:00:00Z",
  "capabilities": {
    "textCompletion": {
      "supported": true
    },
    "imageInput": {
      "supported": true
    }
  }
}
```
