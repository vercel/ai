import { Component } from '@angular/core';
import { ChatComponent } from './chat/chat.component';

@Component({
  selector: 'app-root',
  imports: [ChatComponent],
  template: `
    <main class="container">
      <app-chat />
    </main>
  `,
  styles: `
    :host {
      display: block;
      height: 100vh;
    }

    .container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1rem;
      height: 100%;
      box-sizing: border-box;
      gap: 2rem;
    }
  `,
})
export class AppComponent {
  title = 'chat';
}
