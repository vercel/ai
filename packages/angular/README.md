# AI SDK - Angular integration

Angular UI components for the AI SDK, built with Angular signals. The package includes `Chat`, `Completion`, and `StructuredObject` for streaming chat, text generation, and structured data.

## Setup

```bash
npm i ai @ai-sdk/angular
```

## Usage

```ts
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Chat } from '@ai-sdk/angular';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngFor="let message of chat.messages">
      <div *ngFor="let part of message.parts">
        <p *ngIf="part.type === 'text'">{{ part.text }}</p>
      </div>
    </div>
    <button (click)="chat.sendMessage({ text: 'Hello!' })">Send</button>
  `,
})
export class ChatComponent {
  readonly chat = new Chat({});
}
```

See the [AI SDK Angular documentation](https://ai-sdk.dev/docs/getting-started/angular) for more information.
