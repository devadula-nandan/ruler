// Injects the ruler into every frame of the tab (Storybook renders stories in
// an iframe) and toggles it. content.js is idempotent: a second injection
// flips the existing instance instead of creating a new one.
//
// The badge doubles as the on/off record for each tab, so the state survives
// the service worker being stopped and restarted.
const isOn = async (tabId) => (await chrome.action.getBadgeText({ tabId })) === 'ON';

const setBadge = (tabId, on) => {
  chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#0f62fe' });
};

const setRuler = async (tabId, on) => {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content.js'],
  });
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (enabled) => window.__ruler?.setEnabled(enabled),
    args: [on],
  });
  setBadge(tabId, on);
  return on;
};

const toggle = async (tabId) => setRuler(tabId, !(await isOn(tabId)));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-ruler' || !tab?.id) return;
  // chrome:// pages, the Web Store and similar can't be scripted
  toggle(tab.id).catch((error) => console.warn('Ruler could not run on this page:', error));
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  // A reload or navigation drops the injected script
  if (info.status === 'loading') setBadge(tabId, false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // From the popup
  if (message?.type === 'ruler:state') {
    isOn(message.tabId).then((on) => sendResponse({ on }));
    return true;
  }
  if (message?.type === 'ruler:toggle') {
    toggle(message.tabId).then(
      (on) => sendResponse({ on }),
      (error) => sendResponse({ error: String(error.message ?? error) })
    );
    return true;
  }

  // Escape inside a page turns the ruler off in every frame of that tab
  if (message?.type === 'ruler:off' && sender.tab?.id) {
    setRuler(sender.tab.id, false).catch(() => {});
  }
});
