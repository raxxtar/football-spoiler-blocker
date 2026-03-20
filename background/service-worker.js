// Football Spoiler Blocker - Background Service Worker

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Football Spoiler Blocker installed');

  // Set default storage values
  const result = await chrome.storage.sync.get(['sites', 'enabledSites']);
  if (!result.sites) {
    await chrome.storage.sync.set({
      sites: [],
      enabledSites: {}
    });
  }
});

// Update badge based on extension state
async function updateBadge(tabId, enabled) {
  try {
    if (enabled) {
      await chrome.action.setBadgeText({ text: 'ON', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#1a472a', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (e) {
    console.log('Could not update badge:', e);
  }
}

// Check if current tab's site is enabled
async function checkTabState(tabId, url) {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace(/^www\./, '');

    const result = await chrome.storage.sync.get(['sites', 'enabledSites']);
    const sites = result.sites || [];
    const enabledSites = result.enabledSites || {};

    const isInList = sites.some(site =>
      hostname.includes(site) || site.includes(hostname)
    );

    return isInList && enabledSites[hostname] !== false;
  } catch {
    return false;
  }
}

// Handle tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const enabled = await checkTabState(tabId, tab.url);
    await updateBadge(tabId, enabled);
  }
});

// Handle tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) {
      const enabled = await checkTabState(activeInfo.tabId, tab.url);
      await updateBadge(activeInfo.tabId, enabled);
    }
  } catch (e) {
    console.log('Could not check tab state:', e);
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge') {
    updateBadge(message.tabId, message.enabled);
    sendResponse({ success: true });
  }

  if (message.action === 'getState') {
    (async () => {
      const result = await chrome.storage.sync.get(['sites', 'enabledSites']);
      sendResponse(result);
    })();
    return true; // Keep channel open for async response
  }

  return true;
});

// Listen for storage changes to update badges
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'sync' && (changes.sites || changes.enabledSites)) {
    // Update badge for all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && tab.id) {
        const enabled = await checkTabState(tab.id, tab.url);
        await updateBadge(tab.id, enabled);
      }
    }
  }
});
