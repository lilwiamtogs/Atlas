import Icon from './icon.js';

export default function InstallButton() {
  return `
    <button class="install-app" id="install-app" type="button">
      ${Icon('import')}
      <span>Install</span>
    </button>`;
}
