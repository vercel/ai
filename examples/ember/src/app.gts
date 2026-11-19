import Component from '@glimmer/component';
import { trackedObject } from '@ember/reactive/collections';
import ChatDemo from './chat.gts';
import CompletionDemo from './completion.gts';
import StructuredObjectDemo from './structured-object.gts';

const demos = {
  chat: { label: 'Chat', component: ChatDemo },
  completion: { label: 'Completion', component: CompletionDemo },
  object: { label: 'Structured object', component: StructuredObjectDemo },
};

type DemoName = keyof typeof demos;

const names = Object.keys(demos) as DemoName[];

export default class App extends Component {
  state = trackedObject({ current: 'chat' as DemoName });

  get demo() {
    return demos[this.state.current];
  }

  show = (name: DemoName) => {
    this.state.current = name;
  };

  labelOf = (name: DemoName) => demos[name].label;
  isCurrent = (name: DemoName) => this.state.current === name;

  <template>
    <main>
      <h1>AI SDK + Ember</h1>

      <nav>
        {{#each names as |name|}}
          <button
            type="button"
            aria-pressed={{if (this.isCurrent name) "true" "false"}}
            {{on "click" (fn this.show name)}}
          >{{this.labelOf name}}</button>
        {{/each}}
      </nav>

      {{! Switching demos destroys the old component, which stops its request. }}
      <this.demo.component />
    </main>
  </template>
}
