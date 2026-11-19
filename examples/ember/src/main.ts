import { renderComponent } from '@ember/renderer';
import App from './app.gts';

renderComponent(App, { into: document.body });
