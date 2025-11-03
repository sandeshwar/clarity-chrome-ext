/**
 * Clarity Tab Manager - Advanced Chrome Extension
 * Main application logic for the side panel
 */

class ClarityTabManager {
  constructor() {
    this.tabs = [];
    this.windows = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.currentWindowId = null;
    this.settings = {
      theme: 'dark',
      sortBy: 'position',
      maxTabs: 50,
      autoSuspend: false,
      showFavicons: true,
      enableContextMenu: true,
      enableTabLimit: true,
      maxTabsPerWindow: 50,
      enableStatistics: true,
      enableAutoCleanup: false,
      cleanupInterval: 3600000, // 1 hour
      maxTabAge: 86400000, // 24 hours
      enableNotifications: true
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadSettings();
      await this.getCurrentWindow();
      await this.loadTabs();
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      this.updateStats();
      this.renderTabs();
    } catch (error) {
      console.error('Failed to initialize Clarity Tab Manager:', error);
      this.showError('Failed to load tabs. Please refresh the page.');
    }
  }

  async loadSettings() {
    try {
      const stored = await chrome.storage.sync.get('settings');
      if (stored.settings) {
        this.settings = { ...this.settings, ...stored.settings };
      }
      this.applyTheme();
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.sync.set({ settings: this.settings });
    } catch (error) {
      console.warn('Failed to save settings:', error);
    }
  }

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.settings.theme);
  }

  async getCurrentWindow() {
    try {
      const windows = await chrome.windows.getCurrent({ populate: false });
      this.currentWindowId = windows.id;
    } catch (error) {
      console.error('Failed to get current window:', error);
    }
  }

  async loadTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      this.tabs = tabs.map(tab => this.enrichTabData(tab));
      
      const windows = await chrome.windows.getAll({ populate: false });
      this.windows = windows;
    } catch (error) {
      console.error('Failed to load tabs:', error);
      throw error;
    }
  }

  enrichTabData(tab) {
    return {
      ...tab,
      domain: this.extractDomain(tab.url),
      isDuplicate: this.isDuplicateTab(tab),
      timeSinceAccessed: this.getTimeSinceAccessed(tab.lastAccessed),
      memoryUsage: tab.memoryUsage || 0,
      isActive: tab.active,
      isPinned: tab.pinned,
      windowTitle: this.windows.find(w => w.id === tab.windowId)?.title || 'Unknown Window'
    };
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'Unknown';
    }
  }

  isDuplicateTab(tab) {
    return this.tabs.filter(t => t.url === tab.url).length > 1;
  }

  getTimeSinceAccessed(timestamp) {
    if (!timestamp) return 'Never';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    themeToggle.addEventListener('click', () => this.toggleTheme());

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderTabs();
    });
    
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      this.searchQuery = '';
      this.renderTabs();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.renderTabs();
      });
    });

    // Action buttons
    document.getElementById('groupByDomain').addEventListener('click', () => this.groupByDomain());
    document.getElementById('closeDuplicates').addEventListener('click', () => this.closeDuplicateTabs());
    document.getElementById('suspendTabs').addEventListener('click', () => this.suspendAllTabs());
    document.getElementById('refreshAll').addEventListener('click', () => this.refreshAllTabs());
    document.getElementById('mergeWindowsAsGroups').addEventListener('click', () => this.mergeWindowsAsGroups());
    document.getElementById('sortTabs').addEventListener('click', () => this.cycleSortOrder());

    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    } else {
      console.error('SettingsBtn element not found!');
    }

    // Modal event listeners
    document.getElementById('closeGroupModal').addEventListener('click', () => this.closeGroupModal());
    document.getElementById('cancelGroup').addEventListener('click', () => this.closeGroupModal());
    document.getElementById('confirmGroup').addEventListener('click', () => this.confirmGroupByDomain());

    // Settings modal event listeners
    document.getElementById('closeSettings').addEventListener('click', () => this.closeSettingsModal());
    document.getElementById('cancelSettings').addEventListener('click', () => this.closeSettingsModal());
    document.getElementById('saveSettings').addEventListener('click', () => this.saveSettingsFromModal());
    
    // Modal overlay click to close
    document.getElementById('settingsModal').addEventListener('click', (e) => {
      if (e.target.id === 'settingsModal') {
        this.closeSettingsModal();
      }
    });

    // Chrome tab events
    chrome.tabs.onCreated.addListener(() => this.refreshTabs());
    chrome.tabs.onUpdated.addListener(() => this.refreshTabs());
    chrome.tabs.onRemoved.addListener(() => this.refreshTabs());
    chrome.tabs.onActivated.addListener(() => this.refreshTabs());
    chrome.windows.onCreated.addListener(() => this.refreshTabs());
    chrome.windows.onRemoved.addListener(() => this.refreshTabs());

    // Message listener for service worker communication
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'showStatistics') {
        this.handleShowStatistics();
        sendResponse({ success: true });
      }
    });
  }

  handleShowStatistics() {
    const statsSection = document.querySelector('.stats-section');
    if (!statsSection) {
      console.error('Statistics section not found');
      return;
    }

    // Save original display state
    const originalDisplay = getComputedStyle(statsSection).display;
    
    // Temporarily show statistics section
    statsSection.style.display = 'block';
    
    // Scroll to statistics section with smooth animation
    statsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Add highlight effect
    statsSection.classList.add('highlighted');
    
    // Remove highlight after animation completes
    setTimeout(() => {
      statsSection.classList.remove('highlighted');
    }, 2000);
    
    // Restore original display state after 5 seconds
    setTimeout(() => {
      if (!this.settings.enableStatistics) {
        statsSection.style.display = originalDisplay;
      }
    }, 5000);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K: Focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
      }
      
      // Escape: Clear search or close modals
      if (e.key === 'Escape') {
        if (this.searchQuery) {
          document.getElementById('clearSearch').click();
        } else {
          // Close any open modals
          this.closeGroupModal();
          this.closeSettingsModal();
        }
      }
      
      // Arrow keys: Navigate tabs
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.navigateTabs(e.key === 'ArrowDown' ? 1 : -1);
      }
    });
  }

  async toggleTheme() {
    this.settings.theme = this.settings.theme === 'light' ? 'dark' : 'light';
    this.applyTheme();
    await this.saveSettings();
  }

  getFilteredTabs() {
    let filteredTabs = [...this.tabs];

    // Apply search filter
    if (this.searchQuery) {
      filteredTabs = filteredTabs.filter(tab => 
        tab.title.toLowerCase().includes(this.searchQuery) ||
        tab.url.toLowerCase().includes(this.searchQuery) ||
        tab.domain.toLowerCase().includes(this.searchQuery)
      );
    }

    // Apply view filter
    switch (this.currentFilter) {
      case 'current':
        filteredTabs = filteredTabs.filter(tab => tab.windowId === this.currentWindowId);
        break;
      case 'active':
        filteredTabs = filteredTabs.filter(tab => tab.isActive);
        break;
      case 'duplicates':
        filteredTabs = filteredTabs.filter(tab => tab.isDuplicate);
        break;
    }

    // Apply sorting
    return this.sortTabs(filteredTabs);
  }

  sortTabs(tabs) {
    const sortedTabs = [...tabs];
    
    switch (this.settings.sortBy) {
      case 'title':
        sortedTabs.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'domain':
        sortedTabs.sort((a, b) => a.domain.localeCompare(b.domain));
        break;
      case 'window':
        sortedTabs.sort((a, b) => a.windowId - b.windowId);
        break;
      case 'lastAccessed':
      default:
        sortedTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        break;
    }
    
    return sortedTabs;
  }

  async cycleSortOrder() {
    const sortOptions = ['lastAccessed', 'title', 'domain', 'window'];
    const currentIndex = sortOptions.indexOf(this.settings.sortBy);
    this.settings.sortBy = sortOptions[(currentIndex + 1) % sortOptions.length];
    await this.saveSettings();
    this.renderTabs();
  }

  renderTabs() {
    const container = document.getElementById('tabsContainer');
    const filteredTabs = this.getFilteredTabs();
    
    if (filteredTabs.length === 0) {
      container.innerHTML = '';
      document.getElementById('emptyState').style.display = 'flex';
      return;
    }
    
    document.getElementById('emptyState').style.display = 'none';
    container.innerHTML = '';
    
    filteredTabs.forEach(tab => {
      const tabElement = this.createTabElement(tab);
      container.appendChild(tabElement);
    });
  }

  createTabElement(tab) {
    const template = document.getElementById('tabItemTemplate');
    const element = template.content.cloneNode(true);
    
    const tabItem = element.querySelector('.tab-item');
    tabItem.dataset.tabId = tab.id;
    tabItem.classList.toggle('active', tab.isActive);
    tabItem.classList.toggle('pinned', tab.isPinned);
    
    // Favicon
    const favicon = element.querySelector('.tab-favicon img');
    
    if (tab.favIconUrl && tab.favIconUrl.trim() !== '') {
      favicon.src = tab.favIconUrl;
      favicon.style.display = 'block';
    } else {
      // Use a better fallback favicon
      const fallbackFavicon = this.generateFallbackFavicon(tab.domain);
      favicon.src = fallbackFavicon;
      favicon.style.display = 'block';
    }
    
    // Handle favicon loading errors
    favicon.onerror = () => {
      favicon.src = this.generateFallbackFavicon(tab.domain);
    };
    
    favicon.alt = `${tab.domain} favicon`;
    
    // Content
    element.querySelector('.tab-title').textContent = tab.title;
    element.querySelector('.tab-url').textContent = tab.url;
    
    // Actions
    const pinBtn = element.querySelector('.pin-btn');
    const duplicateBtn = element.querySelector('.duplicate-btn');
    const closeBtn = element.querySelector('.close-btn');
    
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePinTab(tab.id);
    });
    
    duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.duplicateTab(tab.id);
    });
    
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tab.id);
    });
    
    tabItem.addEventListener('click', () => {
      this.switchToTab(tab.id);
    });
    
    return element;
  }

  async switchToTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
    } catch (error) {
      console.error('Failed to switch to tab:', error);
    }
  }

  async togglePinTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { pinned: !tab.pinned });
      await this.refreshTabs();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  }

  async duplicateTab(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.create({
        url: tab.url,
        windowId: tab.windowId,
        index: tab.index + 1,
        active: false
      });
    } catch (error) {
      console.error('Failed to duplicate tab:', error);
    }
  }

  async closeTab(tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      console.error('Failed to close tab:', error);
    }
  }

  async groupByDomain() {
    try {
      this.showGroupModal();
    } catch (error) {
      console.error('Failed to show group modal:', error);
    }
  }

  showGroupModal() {
    const modal = document.getElementById('groupByDomainModal');
    modal.classList.add('active');
    // Reset to default option
    document.getElementById('separateWindows').checked = true;
  }

  closeGroupModal() {
    const modal = document.getElementById('groupByDomainModal');
    modal.classList.remove('active');
  }

  async confirmGroupByDomain() {
    try {
      const selectedOption = document.querySelector('input[name="groupOption"]:checked').value;
      this.closeGroupModal();
      
      if (selectedOption === 'separate') {
        await this.groupByDomainSeparateWindows();
      } else {
        await this.groupByDomainTabGroups();
      }
      
      await this.refreshTabs();
    } catch (error) {
      console.error('Failed to group by domain:', error);
      this.showNotification('Failed to group tabs by domain', 'error');
    }
  }

  async groupByDomainSeparateWindows() {
    try {
      const tabsByDomain = {};
      this.tabs.forEach(tab => {
        if (!tabsByDomain[tab.domain]) {
          tabsByDomain[tab.domain] = [];
        }
        tabsByDomain[tab.domain].push(tab);
      });
      
      let windowsCreated = 0;
      for (const [domain, domainTabs] of Object.entries(tabsByDomain)) {
        if (domainTabs.length > 1) {
          const window = await chrome.windows.create({ url: 'about:blank' });
          for (const tab of domainTabs) {
            await chrome.tabs.move(tab.id, { windowId: window.id, index: -1 });
          }
          windowsCreated++;
        }
      }
      
      this.showNotification(`Created ${windowsCreated} windows for domain grouping`);
    } catch (error) {
      console.error('Failed to group by domain (separate windows):', error);
      throw error;
    }
  }

  async groupByDomainTabGroups() {
    try {
      // Get the current window or create one
      let targetWindow;
      const windows = await chrome.windows.getAll({ populate: true });
      targetWindow = windows.find(w => w.focused) || windows[0];
      
      if (!targetWindow) {
        targetWindow = await chrome.windows.create({ url: 'about:blank' });
      }
      
      // Group tabs by domain
      const tabsByDomain = {};
      this.tabs.forEach(tab => {
        if (!tabsByDomain[tab.domain]) {
          tabsByDomain[tab.domain] = [];
        }
        tabsByDomain[tab.domain].push(tab);
      });
      
      // Move all tabs to the target window first
      const allTabIds = this.tabs.map(tab => tab.id);
      const tabsInTargetWindow = targetWindow.tabs.map(tab => tab.id);
      const tabsToMove = allTabIds.filter(id => !tabsInTargetWindow.includes(id));
      
      if (tabsToMove.length > 0) {
        await chrome.tabs.move(tabsToMove, { windowId: targetWindow.id, index: -1 });
      }
      
      // Get updated tabs in the target window
      const updatedTabs = await chrome.tabs.query({ windowId: targetWindow.id });
      const updatedTabsByDomain = {};
      
      updatedTabs.forEach(tab => {
        const domain = this.extractDomain(tab.url);
        if (!updatedTabsByDomain[domain]) {
          updatedTabsByDomain[domain] = [];
        }
        updatedTabsByDomain[domain].push(tab);
      });
      
      // Create tab groups for domains with multiple tabs
      let groupsCreated = 0;
      let currentIndex = 0;
      
      for (const [domain, domainTabs] of Object.entries(updatedTabsByDomain)) {
        if (domainTabs.length > 1) {
          try {
            // Group the tabs
            const tabIds = domainTabs.map(tab => tab.id);
            const groupId = await chrome.tabs.group({ tabIds });
            
            // Update the group with a title and color
            await chrome.tabGroups.update(groupId, {
              title: domain.charAt(0).toUpperCase() + domain.slice(1),
              color: this.getDomainGroupColor(domain)
            });
            
            groupsCreated++;
          } catch (error) {
            console.warn('Failed to create tab group for domain:', domain, error);
            // Tab groups might not be available in all Chrome versions
          }
        }
        currentIndex += domainTabs.length;
      }
      
      // Focus the target window
      await chrome.windows.update(targetWindow.id, { focused: true });
      
      if (groupsCreated > 0) {
        this.showNotification(`Created ${groupsCreated} tab groups for domain organization`);
      } else {
        this.showNotification('Tabs organized by domain (no groups created - single tabs per domain)');
      }
    } catch (error) {
      console.error('Failed to group by domain (tab groups):', error);
      throw error;
    }
  }

  getDomainGroupColor(domain) {
    // Generate a consistent color based on domain name
    const colors = ['blue', 'red', 'green', 'yellow', 'pink', 'purple', 'cyan', 'orange'];
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  async closeDuplicateTabs() {
    try {
      const seenUrls = new Set();
      const tabsToClose = [];
      
      this.tabs.forEach(tab => {
        if (seenUrls.has(tab.url)) {
          tabsToClose.push(tab.id);
        } else {
          seenUrls.add(tab.url);
        }
      });
      
      if (tabsToClose.length > 0) {
        await chrome.tabs.remove(tabsToClose);
        this.showNotification(`Closed ${tabsToClose.length} duplicate tabs`);
      }
    } catch (error) {
      console.error('Failed to close duplicates:', error);
    }
  }

  async suspendAllTabs() {
    try {
      const activeTabs = this.tabs.filter(tab => !tab.isActive && !tab.pinned);
      const suspendedCount = activeTabs.length;
      
      // Chrome doesn't have a built-in suspend API, so we'll discard tabs
      // In a real implementation, you might use the chrome.tabs.discard API
      for (const tab of activeTabs) {
        try {
          await chrome.tabs.discard(tab.id);
        } catch {
          // Tab might already be discarded or closed
        }
      }
      
      this.showNotification(`Suspended ${suspendedCount} tabs`);
    } catch (error) {
      console.error('Failed to suspend tabs:', error);
    }
  }

  async refreshAllTabs() {
    try {
      const activeTabs = this.tabs.filter(tab => !tab.pinned);
      for (const tab of activeTabs) {
        try {
          await chrome.tabs.reload(tab.id);
        } catch {
          // Tab might be closed
        }
      }
      this.showNotification(`Refreshing ${activeTabs.length} tabs`);
    } catch (error) {
      console.error('Failed to refresh tabs:', error);
    }
  }

  async mergeWindowsAsGroups() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      if (windows.length <= 1) {
        this.showNotification('Only one window found, nothing to merge');
        return;
      }

      // Find the main window (largest or first focused window)
      const mainWindow = windows.find(w => w.focused) || 
                        windows.reduce((prev, current) => 
                          (prev.tabs.length > current.tabs.length) ? prev : current
                        );

      // Group tabs by window for organization
      const windowGroups = [];
      let currentTabIndex = mainWindow.tabs.length;

      for (const window of windows) {
        if (window.id === mainWindow.id) continue;
        
        if (window.tabs.length > 0) {
          windowGroups.push({
            windowId: window.id,
            windowTitle: window.title || `Window ${window.id}`,
            tabs: [...window.tabs]
          });
        }
      }

      if (windowGroups.length === 0) {
        this.showNotification('No tabs to merge from other windows');
        return;
      }

      // Move tabs from other windows to main window
      const tabsToMove = [];
      for (const group of windowGroups) {
        tabsToMove.push(...group.tabs.map(tab => tab.id));
      }

      if (tabsToMove.length > 0) {
        // Move all tabs to the main window
        await chrome.tabs.move(tabsToMove, { 
          windowId: mainWindow.id, 
          index: currentTabIndex 
        });

        // Close the now-empty windows
        for (const group of windowGroups) {
          try {
            await chrome.windows.remove(group.windowId);
          } catch (error) {
            console.warn('Failed to close window:', group.windowId, error);
          }
        }

        // Focus the main window
        await chrome.windows.update(mainWindow.id, { focused: true });

        this.showNotification(`Merged ${tabsToMove.length} tabs from ${windowGroups.length} windows into main window`);
        
        // Refresh the tabs display
        await this.refreshTabs();
      }
    } catch (error) {
      console.error('Failed to merge windows as groups:', error);
      this.showNotification('Failed to merge windows', 'error');
    }
  }

  async refreshTabs() {
    try {
      await this.loadTabs();
      this.updateStats();
      this.renderTabs();
    } catch (error) {
      console.error('Failed to refresh tabs:', error);
    }
  }

  getDuplicateTabs() {
    if (!this.tabs) return [];
    
    const urlMap = new Map();
    const duplicates = [];
    
    // Group tabs by URL
    this.tabs.forEach(tab => {
      const url = tab.url;
      if (urlMap.has(url)) {
        urlMap.get(url).push(tab);
      } else {
        urlMap.set(url, [tab]);
      }
    });
    
    // Find duplicates (URLs with more than 1 tab)
    urlMap.forEach((tabs, url) => {
      if (tabs.length > 1) {
        duplicates.push(...tabs.slice(1)); // Return all but the first tab as duplicates
      }
    });
    
    return duplicates;
  }

  updateStats() {
    const totalTabs = this.tabs.length;
    const totalWindows = this.windows.length;
    const duplicates = this.getDuplicateTabs().length;
    
    // Update statistics display with null checks
    const totalTabsElem = document.getElementById('totalTabs');
    if (totalTabsElem) totalTabsElem.textContent = totalTabs;
    
    const windowsCountElem = document.getElementById('windowsCount');
    if (windowsCountElem) windowsCountElem.textContent = totalWindows;
    
    const duplicateCountElem = document.getElementById('duplicateCount');
    if (duplicateCountElem) duplicateCountElem.textContent = duplicates;
    
    // Show/hide statistics section based on setting
    const statsSection = document.querySelector('.stats-section');
    if (statsSection) {
      if (this.settings.enableStatistics) {
        statsSection.style.display = 'block';
      } else {
        statsSection.style.display = 'none';
      }
    }
    
    // Show tab limit warning if enabled
    if (this.settings.enableTabLimit && totalTabs > this.settings.maxTabs) {
      this.showTabLimitWarning(totalTabs);
    }
  }

  showTabLimitWarning(count) {
    this.showNotification(`Warning: You have ${count} tabs open (limit: ${this.settings.maxTabs})`, 'warning');
  }

  navigateTabs(direction) {
    const tabItems = document.querySelectorAll('.tab-item:not([style*="display: none"])');
    const activeItem = document.querySelector('.tab-item.active');
    
    let currentIndex = -1;
    if (activeItem) {
      currentIndex = Array.from(tabItems).indexOf(activeItem);
    }
    
    const nextIndex = Math.max(0, Math.min(tabItems.length - 1, currentIndex + direction));
    const nextItem = tabItems[nextIndex];
    
    if (nextItem) {
      nextItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      nextItem.classList.add('highlighted');
      setTimeout(() => nextItem.classList.remove('highlighted'), 1000);
    }
  }

  openSettings() {
    this.showSettingsModal();
  }

  showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
      console.error('Settings modal not found');
      return;
    }
    modal.classList.add('active');
    try {
      this.populateSettingsForm();
    } catch (error) {
      console.error('Error populating settings form:', error);
    }
  }

  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  populateSettingsForm() {
    // Populate form with current settings
    const settings = this.settings;
    
    // Auto-cleanup settings
    document.getElementById('enableAutoCleanup').checked = settings.enableAutoCleanup || false;
    document.getElementById('cleanupInterval').value = (settings.cleanupInterval || 3600000) / 60000; // Convert to minutes with fallback
    document.getElementById('maxTabAge').value = settings.maxTabAge || 86400000;
    
    // Tab limits
    document.getElementById('enableTabLimit').checked = settings.enableTabLimit !== false;
    document.getElementById('maxTabsPerWindow').value = settings.maxTabsPerWindow || 50;
    
    // UI preferences
    document.getElementById('enableStatistics').checked = settings.enableStatistics !== false;
    document.getElementById('enableContextMenu').checked = settings.enableContextMenu !== false;
    document.getElementById('enableNotifications').checked = settings.enableNotifications !== false;
  }

  async saveSettingsFromModal() {
    try {
      // Get values from form with validation
      const maxTabsPerWindow = parseInt(document.getElementById('maxTabsPerWindow').value);
      
      // Validate maxTabsPerWindow
      if (isNaN(maxTabsPerWindow) || maxTabsPerWindow < 10 || maxTabsPerWindow > 100) {
        this.showError('Maximum tabs per window must be between 10 and 100');
        return;
      }

      const newSettings = {
        enableAutoCleanup: document.getElementById('enableAutoCleanup').checked,
        cleanupInterval: parseInt(document.getElementById('cleanupInterval').value) * 60000, // Convert to milliseconds
        maxTabAge: parseInt(document.getElementById('maxTabAge').value),
        enableTabLimit: document.getElementById('enableTabLimit').checked,
        maxTabsPerWindow: maxTabsPerWindow,
        enableStatistics: document.getElementById('enableStatistics').checked,
        enableContextMenu: document.getElementById('enableContextMenu').checked,
        enableNotifications: document.getElementById('enableNotifications').checked,
        
        // Preserve existing settings
        theme: this.settings.theme,
        sortBy: this.settings.sortBy,
        maxTabs: this.settings.maxTabs,
        autoSuspend: this.settings.autoSuspend
      };

      // Save to storage
      this.settings = { ...this.settings, ...newSettings };
      await this.saveSettings();
      
      this.closeSettingsModal();
      this.showNotification('Settings saved successfully!');
      
      // Refresh the UI to apply new settings
      this.refreshTabs();
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
    }
  }

  showNotification(message, type = 'info') {
    // Check if notifications are enabled
    if (!this.settings.enableNotifications) {
      return;
    }
    
    // Create a simple notification (you could enhance this with a toast component)
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--accent-primary);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: var(--shadow-lg);
      z-index: var(--z-modal);
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  hideLoadingState() {
    document.getElementById('loadingState').style.display = 'none';
  }

  generateFallbackFavicon(domain) {
    // Generate a colored SVG favicon based on domain
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'
    ];
    
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    
    // Get first letter of domain for the favicon
    const initial = domain.charAt(0).toUpperCase();
    
    // Create SVG favicon with domain initial
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <rect width="24" height="24" fill="${color}" rx="4"/>
        <text x="12" y="16" font-family="Arial, sans-serif" font-size="14" font-weight="bold" text-anchor="middle" fill="white">${initial}</text>
      </svg>
    `;
    
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new ClarityTabManager();
});

// Add some additional CSS for notifications and highlights
const additionalCSS = `
  .notification-error {
    background: var(--danger) !important;
  }
  
  .notification-warning {
    background: var(--warning) !important;
  }
  
  .tab-item.highlighted {
    border-color: var(--accent-primary) !important;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;

const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);
