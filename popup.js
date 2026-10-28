// Toolbar popup: turns the ruler on or off for the current tab, picks which
// specs show (shared with the page through storage) and lists the shortcuts.
const DEFAULT_SPECS = ['typography', 'color'];

const toggle = document.getElementById('toggle');
const stateLabel = document.getElementById('state');
const errorLine = document.getElementById('error');
const specBoxes = [...document.querySelectorAll('[data-spec]')];
const gridBox = document.getElementById('grid');

// Mac shows modifier symbols, like Chrome's own menus
if (navigator.userAgent.includes('Mac')) {
  const symbols = { alt: '⌥', shift: '⇧' };
  for (const key of document.querySelectorAll('[data-key]')) key.textContent = symbols[key.dataset.key];
}

const showState = (on) => {
  toggle.disabled = false;
  toggle.checked = on;
  stateLabel.textContent = on ? 'On' : 'Off';
};

const showError = (message) => {
  errorLine.hidden = false;
  errorLine.textContent = /cannot be scripted|chrome:\/\/|Cannot access/i.test(message)
    ? "Chrome doesn't let extensions run on this page."
    : message;
};

// Remember which sections were left open
for (const section of document.querySelectorAll('details')) {
  try {
    section.open = localStorage.getItem(`open:${section.id}`) === '1';
  } catch {}
  section.addEventListener('toggle', () => {
    try {
      localStorage.setItem(`open:${section.id}`, section.open ? '1' : '0');
    } catch {}
  });
}

document.getElementById('shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const { on } = await chrome.runtime.sendMessage({ type: 'ruler:state', tabId: tab.id });
  showState(on);
  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    const result = await chrome.runtime.sendMessage({ type: 'ruler:toggle', tabId: tab.id });
    if (result.error) {
      showError(result.error);
      showState(on);
      return;
    }
    // Get out of the way so the page can be used right away
    window.close();
  });

  // The user may have changed the shortcut in chrome://extensions/shortcuts
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'toggle-ruler')?.shortcut;
  document.getElementById('shortcut').textContent = shortcut || 'Not set';

  const { rulerSpecs, rulerGrid } = await chrome.storage.local.get(['rulerSpecs', 'rulerGrid']);
  const specs = new Set(Array.isArray(rulerSpecs) ? rulerSpecs : DEFAULT_SPECS);
  for (const box of specBoxes) {
    box.checked = specs.has(box.dataset.spec);
    box.addEventListener('change', () => {
      const chosen = specBoxes.filter((b) => b.checked).map((b) => b.dataset.spec);
      chrome.storage.local.set({ rulerSpecs: chosen });
    });
  }
  gridBox.checked = rulerGrid === true;
  gridBox.addEventListener('change', () => chrome.storage.local.set({ rulerGrid: gridBox.checked }));
})();
