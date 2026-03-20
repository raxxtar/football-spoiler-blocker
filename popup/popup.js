document.addEventListener('DOMContentLoaded', async () => {
  const siteToggle = document.getElementById('siteToggle');
  const currentSiteEl = document.getElementById('currentSite');
  const newSiteInput = document.getElementById('newSiteInput');
  const addSiteBtn = document.getElementById('addSiteBtn');
  const siteList = document.getElementById('siteList');
  const emptyMessage = document.getElementById('emptyMessage');
  const refreshBtn = document.getElementById('refreshBtn');

  let currentHostname = '';

  // Get current tab's hostname
  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        return url.hostname.replace(/^www\./, '');
      } catch {
        return '';
      }
    }
    return '';
  }

  // Load sites from storage
  async function loadSites() {
    const result = await chrome.storage.sync.get(['sites', 'enabledSites']);
    return {
      sites: result.sites || [],
      enabledSites: result.enabledSites || {}
    };
  }

  // Save sites to storage
  async function saveSites(sites) {
    await chrome.storage.sync.set({ sites });
  }

  // Save enabled state for a site
  async function saveEnabledState(hostname, enabled) {
    const { enabledSites } = await loadSites();
    enabledSites[hostname] = enabled;
    await chrome.storage.sync.set({ enabledSites });
  }

  // Render site list
  async function renderSiteList() {
    const { sites } = await loadSites();
    siteList.innerHTML = '';

    if (sites.length === 0) {
      emptyMessage.classList.remove('hidden');
    } else {
      emptyMessage.classList.add('hidden');
      sites.forEach(site => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="site-name">${site}</span>
          <button class="delete-btn" data-site="${site}" title="Remove site">&times;</button>
        `;
        siteList.appendChild(li);
      });
    }
  }

  // Add new site
  async function addSite(hostname) {
    if (!hostname) return;

    // Normalize hostname
    hostname = hostname.toLowerCase().trim().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');

    if (!hostname) return;

    const { sites } = await loadSites();
    if (!sites.includes(hostname)) {
      sites.push(hostname);
      await saveSites(sites);
      await renderSiteList();
    }

    newSiteInput.value = '';
  }

  // Remove site
  async function removeSite(hostname) {
    const { sites } = await loadSites();
    const index = sites.indexOf(hostname);
    if (index > -1) {
      sites.splice(index, 1);
      await saveSites(sites);
      await renderSiteList();

      // Update toggle if current site was removed
      if (hostname === currentHostname) {
        siteToggle.checked = false;
      }
    }
  }

  // Check if current site is in the list and enabled
  async function updateToggleState() {
    const { sites, enabledSites } = await loadSites();
    const isInList = sites.some(site => currentHostname.includes(site) || site.includes(currentHostname));
    const isEnabled = enabledSites[currentHostname] !== false && isInList;
    siteToggle.checked = isEnabled;
  }

  // Notify content script of state change
  async function notifyContentScript(enabled) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'toggleSpoilerBlock',
          enabled,
          hostname: currentHostname
        });
      } catch (e) {
        // Content script might not be loaded yet
        console.log('Could not reach content script:', e);
      }
    }
  }

  // Initialize
  currentHostname = await getCurrentTab();
  currentSiteEl.textContent = currentHostname || 'Unable to detect site';

  await renderSiteList();
  await updateToggleState();

  // Event listeners
  siteToggle.addEventListener('change', async (e) => {
    const enabled = e.target.checked;

    if (enabled) {
      // Add current site to list if not already there
      const { sites } = await loadSites();
      if (!sites.some(site => currentHostname.includes(site) || site.includes(currentHostname))) {
        await addSite(currentHostname);
      }
    }

    await saveEnabledState(currentHostname, enabled);
    await notifyContentScript(enabled);

    // Update badge
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      enabled,
      tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id
    });
  });

  addSiteBtn.addEventListener('click', () => addSite(newSiteInput.value));

  newSiteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addSite(newSiteInput.value);
    }
  });

  siteList.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const site = e.target.dataset.site;
      removeSite(site);
    }
  });

  refreshBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.reload(tab.id);
      window.close();
    }
  });
});
