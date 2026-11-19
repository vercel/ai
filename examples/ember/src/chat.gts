import Component from '@glimmer/component';
import { Chat } from '@ai-sdk/ember';
import { isToolUIPart, type UIMessage } from 'ai';

type Part = UIMessage['parts'][number];

const isText = (part: Part) => part.type === 'text';
const isReasoning = (part: Part) => part.type === 'reasoning';
const isTool = (part: Part) => isToolUIPart(part);
const toJson = (value: unknown) => JSON.stringify(value, null, 2);
const roleLabel = (message: UIMessage) =>
  message.role === 'user' ? 'You' : 'AI';

export default class ChatDemo extends Component {
  /**
   * `this` as the parent stops the response when the component goes away.
   */
  chat = new Chat(this, {});

  get isWaiting() {
    return this.chat.status === 'submitted';
  }

  get isBusy() {
    return this.chat.status === 'submitted' || this.chat.status === 'streaming';
  }

  send = (event: SubmitEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('message') as HTMLInputElement;
    const text = input.value.trim();

    if (text && !this.isBusy) {
      void this.chat.sendMessage({ text });
      input.value = '';
    }
  };

  <template>
    <section class="chat">
      {{#each this.chat.messages key="id" as |message|}}
        <article class="message {{message.role}}">
          <strong>{{roleLabel message}}</strong>
          {{#each message.parts key="@index" as |part|}}
            {{#if (isText part)}}
              <p>{{part.text}}</p>
            {{else if (isReasoning part)}}
              <details>
                <summary>Reasoning</summary>
                <p>{{part.text}}</p>
              </details>
            {{else if (isTool part)}}
              <pre>{{toJson part}}</pre>
            {{/if}}
          {{/each}}
        </article>
      {{/each}}

      {{#if this.isWaiting}}
        <p><em>Waiting...</em></p>
      {{/if}}

      {{#if this.chat.error}}
        <p role="alert">{{this.chat.error.message}}</p>
      {{/if}}

      <form {{on "submit" this.send}}>
        <label for="message">Your message</label>
        <input id="message" name="message" autocomplete="off" />
        <button type="submit" disabled={{this.isBusy}}>Send</button>
        {{#if this.isBusy}}
          <button type="button" {{on "click" this.chat.stop}}>Stop</button>
        {{/if}}
      </form>
    </section>
  </template>
}
