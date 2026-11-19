# AI SDK - Ember integration

Ember classes for AI SDK UI, built on Ember's tracked state. The package includes `Chat`, `Completion`, and `StructuredObject` for streaming chat, text generation, and structured data.

> **Note**: requires `ember-source` 7.1 or later.

## Setup

```bash
npm i ai @ai-sdk/ember
```

## Usage

```tsx
import Component from '@glimmer/component';
import { Chat } from '@ai-sdk/ember';
import type { UIMessage } from 'ai';

type Part = UIMessage['parts'][number];

const isText = (part: Part) => part.type === 'text';

export default class ChatComponent extends Component {
  chat = new Chat(this, {});

  sayHello = () => {
    this.chat.sendMessage({ text: 'Hello!' });
  };

  <template>
    {{#each this.chat.messages key="id" as |message|}}
      {{#each message.parts key="@index" as |part|}}
        {{#if (isText part)}}
          <p>{{part.text}}</p>
        {{/if}}
      {{/each}}
    {{/each}}

    <button type="button" {{on "click" this.sayHello}}>Send</button>
  </template>
}
```

See the [AI SDK Ember documentation](https://ai-sdk.dev/docs/getting-started/ember) for more information.
