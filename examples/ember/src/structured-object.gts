import Component from '@glimmer/component';
import { StructuredObject } from '@ai-sdk/ember';
import { z } from 'zod';

const schema = z.object({
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
});

const joinTags = (tags: (string | undefined)[] | undefined) =>
  tags?.join(', ');

export default class StructuredObjectDemo extends Component {
  analysis = new StructuredObject(this, {
    api: '/api/analyze',
    schema,
  });

  analyze = (event: SubmitEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const content = form.elements.namedItem('content') as HTMLTextAreaElement;

    if (content.value.trim()) {
      void this.analysis.submit(content.value);
    }
  };

  <template>
    <section>
      <form {{on "submit" this.analyze}}>
        <label for="content">Content to analyze</label>
        <textarea id="content" name="content" rows="4"></textarea>
        <button type="submit" disabled={{this.analysis.loading}}>
          {{if this.analysis.loading "Analyzing..." "Analyze"}}
        </button>
        {{#if this.analysis.loading}}
          <button type="button" {{on "click" this.analysis.stop}}>Stop</button>
        {{/if}}
      </form>

      {{#let this.analysis.object as |object|}}
        {{#if object}}
          <dl>
            <dt>Title</dt>
            <dd>{{object.title}}</dd>
            <dt>Summary</dt>
            <dd>{{object.summary}}</dd>
            <dt>Tags</dt>
            <dd>{{joinTags object.tags}}</dd>
            <dt>Sentiment</dt>
            <dd>{{object.sentiment}}</dd>
          </dl>
        {{/if}}
      {{/let}}

      {{#if this.analysis.error}}
        <p role="alert">{{this.analysis.error.message}}</p>
      {{/if}}
    </section>
  </template>
}
