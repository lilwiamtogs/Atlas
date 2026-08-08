let outsideClickBound = false;

function closePicker(picker) {
  picker.classList.remove('is-open');
  picker.querySelector('.atlas-select-trigger')?.setAttribute('aria-expanded', 'false');
}

function closeOtherPickers(current) {
  document.querySelectorAll('[data-atlas-select].is-open').forEach((picker) => {
    if (picker !== current) closePicker(picker);
  });
}

function labelFor(select) {
  const label = select.closest('label');
  if (!label) return select.getAttribute('aria-label') || select.name || 'option';
  return [...label.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent.trim())
    .filter(Boolean)
    .join(' ') || select.name || 'option';
}

function enhanceSelect(select) {
  if (select.dataset.atlasEnhanced === 'true') return;
  select.dataset.atlasEnhanced = 'true';
  select.classList.add('atlas-native-select');

  const picker = document.createElement('span');
  picker.className = 'atlas-select atlas-enhanced-select';
  picker.dataset.atlasSelect = '';
  const trigger = document.createElement('button');
  trigger.className = 'atlas-select-trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', `Choose ${labelFor(select)}`);
  const selectedLabel = document.createElement('span');
  selectedLabel.dataset.atlasSelectLabel = '';
  const chevron = document.createElement('span');
  chevron.className = 'atlas-select-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  trigger.append(selectedLabel, chevron);

  const menu = document.createElement('span');
  menu.className = 'atlas-select-menu';
  menu.setAttribute('role', 'listbox');

  const sync = () => {
    const selected = select.options[select.selectedIndex];
    selectedLabel.textContent = selected?.textContent || 'Choose an option';
    trigger.disabled = select.disabled;
    menu.querySelectorAll('[data-select-value]').forEach((option) => {
      option.setAttribute('aria-selected', String(option.dataset.selectValue === select.value));
    });
  };

  [...select.options].forEach((nativeOption) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.dataset.selectValue = nativeOption.value;
    option.textContent = nativeOption.textContent;
    option.disabled = nativeOption.disabled;
    option.addEventListener('click', () => {
      select.value = nativeOption.value;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      closePicker(picker);
      trigger.focus();
    });
    menu.append(option);
  });

  trigger.addEventListener('click', () => {
    const opening = !picker.classList.contains('is-open');
    closeOtherPickers(picker);
    picker.classList.toggle('is-open', opening);
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) menu.querySelector('[aria-selected="true"]')?.focus();
  });
  picker.addEventListener('keydown', (event) => {
    const options = [...menu.querySelectorAll('[role="option"]:not(:disabled)')];
    const current = options.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      closePicker(picker);
      trigger.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      options[Math.min(options.length - 1, current + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      options[Math.max(0, current - 1)]?.focus();
    }
  });
  select.addEventListener('input', sync);
  select.insertAdjacentElement('afterend', picker);
  picker.append(trigger, menu);
  sync();
}

export default function enhanceSelects(root = document) {
  root.querySelectorAll('select').forEach(enhanceSelect);
  if (outsideClickBound) return;
  outsideClickBound = true;
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-atlas-select]')) return;
    document.querySelectorAll('[data-atlas-select].is-open').forEach(closePicker);
  });
}
