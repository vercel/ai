import Component from '@glimmer/component';
import { Completion } from '@ai-sdk/ember';

export default class CompletionDemo extends Component {
  completion = new Completion(this, {
    api: '/api/completion',
    streamProtocol: 'text',
  });

  updateInput = (event: Event) => {
    this.completion.input = (event.target as HTMLTextAreaElement).value;
  };

  <template>
    <section>
      <form {{on "submit" this.completion.handleSubmit}}>
        <label for="prompt">Prompt</label>
        <textarea
          id="prompt"
          rows="4"
          value={{this.completion.input}}
          {{on "input" this.updateInput}}
        ></textarea>
        <button type="submit" disabled={{this.completion.loading}}>
          {{if this.completion.loading "Generating..." "Generate"}}
        </button>
        {{#if this.completion.loading}}
          <button type="button" {{on "click" this.completion.stop}}>Stop</button>
        {{/if}}
      </form>

      {{#if this.completion.completion}}
        <pre>{{this.completion.completion}}</pre>
      {{/if}}

      {{#if this.completion.error}}
        <p role="alert">{{this.completion.error.message}}</p>
      {{/if}}
    </section>
  </template>
}
