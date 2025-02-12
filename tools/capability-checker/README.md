# AI SDK - Capability Checker

The **Capability Checker** tool provides a standardized test suite for validating AI models against a set of capabilities.

## Overview

The Capability Checker tool includes:

1. **Core Test Suite Generator:** Runs standardized tests across various capabilities such as:

   - Text Generation
   - Object Generation
   - Tool Usage
   - Search Grounding
   - Embedding Generation
   - Image Generation
   - Audio and PDF Input

2. **Model-Specific Test Implementations:** Configures and customizes tests for individual providers and models based on their unique characteristics.

## Data-Driven Testing

Capability Checker uses a data-driven approach to run and track tests:

### Configuration

Define your model capabilities in `etc/model-capabilities.json`. For example:

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

Execute the Capability Checker tests with the following command:

```bash
pnpm run test:capabilities
```

### Results

Test results are output as JSON files in the `results` directory using the following structure:

- Files are saved as: `<provider>/<model-type>/<model-id>.json`  
  (e.g. `openai/language/gpt-4-turbo-preview.json`)
- Each file contains a JSON object detailing:
  - The timestamp of the test run
  - Pass/fail status and error details for each capability

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
