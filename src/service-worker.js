/**
 * Clarity Tab Manager - Service Worker
 * Handles background tasks, context menus, and tab statistics
 */

class ClarityServiceWorker {
  constructor() {
    this.stats = {
      totalTabsOpened: 0,
      totalTabsClosed: 0,
      sessionStartTime: Date.now(),
      lastActivity: Date.now(),
      windowStats: {},
      domainStats: {}
    };
    
    this.settings = {
      enableContextMenu: true,
      enableTabLimit: true,
      maxTabsPerWindow: 50,
      enableStatistics: true,
      enableAutoCleanup: false,
      cleanupInterval: 3600000, // 1 hour
      maxTabAge: 86400000 // 24 hours
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadSettings();
      await this.loadStats();
      this.setupEventListeners();
      this.setupContextMenu();
      this.setupAlarms();
      this.setupInstallHandler();
    } catch (error) {
      console.error('Failed to initialize service worker:', error);
    }
  }

  async loadSettings() {
    try {
      const stored = await chrome.storage.sync.get('settings');
      if (stored.settings) {
        this.settings = { ...this.settings, ...stored.settings };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  async loadStats() {
    try {
      const stored = await chrome.storage.local.get('stats');
      if (stored.stats) {
        this.stats = { ...this.stats, ...stored.stats };
      }
    } catch (error) {
      console.warn('Failed to load stats:', error);
    }
  }

  async saveStats() {
    try {
      await chrome.storage.local.set({ stats: this.stats });
    } catch (error) {
      console.warn('Failed to save stats:', error);
    }
  }

  setupEventListeners() {
    // Action click event
    chrome.action.onClicked.addListener((tab) => {
      chrome.sidePanel.open({ windowId: tab.windowId });
    });
    
    // Tab events
    chrome.tabs.onCreated.addListener((tab) => this.handleTabCreated(tab));
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => this.handleTabUpdated(tabId, changeInfo, tab));
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => this.handleTabRemoved(tabId, removeInfo));
    chrome.tabs.onActivated.addListener((activeInfo) => this.handleTabActivated(activeInfo));
    chrome.tabs.onAttached.addListener((tabId, attachInfo) => this.handleTabAttached(tabId, attachInfo));
    chrome.tabs.onMoved.addListener((tabId, moveInfo) => this.handleTabMoved(tabId, moveInfo));
    
    // Window events
    chrome.windows.onCreated.addListener((window) => this.handleWindowCreated(window));
    chrome.windows.onRemoved.addListener((windowId) => this.handleWindowRemoved(windowId));
    chrome.windows.onFocusChanged.addListener((windowId) => this.handleWindowFocusChanged(windowId));
    
    // Storage events
    chrome.storage.onChanged.addListener((changes, namespace) => this.handleStorageChanged(changes, namespace));
    
    // Command events
    chrome.commands.onCommand.addListener((command) => this.handleCommand(command));
  }

  setupContextMenu() {
    if (!this.settings.enableContextMenu) return;

    chrome.contextMenus.removeAll(() => {
      // Main context menu
      try {
        chrome.contextMenus.create({
          id: 'clarity-main',
          title: 'Clarity Tab Manager',
          contexts: ['page']
        });
      } catch (error) {
        // Ignore duplicate ID errors - they're cosmetic
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating main context menu:', error);
        }
      }

      // Tab Actions submenu
      try {
        chrome.contextMenus.create({
          id: 'clarity-tabs',
          parentId: 'clarity-main',
          title: 'Tab Actions',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating tabs submenu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-close-duplicates',
          parentId: 'clarity-tabs',
          title: 'Close Duplicate Tabs',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating close duplicates menu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-close-left',
          parentId: 'clarity-tabs',
          title: 'Close Tabs to Left',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating close left menu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-close-right',
          parentId: 'clarity-tabs',
          title: 'Close Tabs to Right',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating close right menu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-close-others',
          parentId: 'clarity-tabs',
          title: 'Close Other Tabs',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating close others menu:', error);
        }
      }

      // Window Actions submenu
      try {
        chrome.contextMenus.create({
          id: 'clarity-windows',
          parentId: 'clarity-main',
          title: 'Window Actions',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating windows submenu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-move-new-window',
          parentId: 'clarity-windows',
          title: 'Move Tab to New Window',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating move to new window menu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-merge-windows',
          parentId: 'clarity-windows',
          title: 'Merge Windows',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating merge windows menu:', error);
        }
      }

      try {
        chrome.contextMenus.create({
          id: 'clarity-merge-windows-groups',
          parentId: 'clarity-windows',
          title: 'Merge Windows as Groups',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating merge windows groups menu:', error);
        }
      }

      // Statistics
      try {
        chrome.contextMenus.create({
          id: 'clarity-stats',
          parentId: 'clarity-main',
          title: 'View Statistics',
          contexts: ['page']
        });
      } catch (error) {
        if (!error.message.includes('duplicate id')) {
          console.error('Error creating stats menu:', error);
        }
      }
    });
  }

  setupAlarms() {
    // Clear existing alarms first
    chrome.alarms.clear('cleanup');
    chrome.alarms.clear('update-stats');
    
    if (this.settings.enableAutoCleanup) {
      chrome.alarms.create('cleanup', {
        periodInMinutes: this.settings.cleanupInterval / 60000
      });
    }
    
    // Statistics update alarm (always enabled)
    chrome.alarms.create('update-stats', {
      periodInMinutes: 5
    });
  }

  setupInstallHandler() {
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        await this.handleInstall();
      } else if (details.reason === 'update') {
        await this.handleUpdate(details.previousVersion);
      }
    });
  }

  async handleInstall() {
    try {
      // Initialize default settings
      await chrome.storage.sync.set({ settings: this.settings });
      await chrome.storage.local.set({ stats: this.stats });
      
      // Open welcome page or side panel
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/sidepanel.html'),
        active: true
      });
      
      console.log('Clarity Tab Manager installed successfully');
    } catch (error) {
      console.error('Failed to handle install:', error);
    }
  }

  async handleUpdate(previousVersion) {
    console.log(`Clarity Tab Manager updated from ${previousVersion}`);
    
    // Handle version-specific migrations
    if (this.compareVersions(previousVersion, '2.0.0') < 0) {
      // Migration logic for major version update
      await this.migrateToV2();
    }
  }

  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    
    return 0;
  }

  async migrateToV2() {
    // Handle migration from v1 to v2
    try {
      const oldData = await chrome.storage.local.get(null);
      // Migration logic here
      console.log('Migration to v2 completed');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  // Tab event handlers
  async handleTabCreated(tab) {
    this.stats.totalTabsOpened++;
    this.stats.lastActivity = Date.now();
    
    const domain = this.extractDomain(tab.url);
    this.updateDomainStats(domain, 'created');
    
    await this.saveStats();
    await this.checkTabLimit(tab.windowId);
  }

  async handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
      const domain = this.extractDomain(tab.url);
      this.updateDomainStats(domain, 'updated');
    }
    
    this.stats.lastActivity = Date.now();
    await this.saveStats();
  }

  async handleTabRemoved(tabId, removeInfo) {
    this.stats.totalTabsClosed++;
    this.stats.lastActivity = Date.now();
    
    await this.saveStats();
    await this.updateWindowStats(removeInfo.windowId);
  }

  async handleTabActivated(activeInfo) {
    this.stats.lastActivity = Date.now();
    await this.saveStats();
  }

  async handleTabAttached(tabId, attachInfo) {
    await this.updateWindowStats(attachInfo.newWindowId);
  }

  async handleTabMoved(tabId, moveInfo) {
    // Handle tab movement if needed
  }

  // Window event handlers
  async handleWindowCreated(window) {
    this.stats.windowStats[window.id] = {
      created: Date.now(),
      tabCount: 0
    };
    
    await this.saveStats();
  }

  async handleWindowRemoved(windowId) {
    delete this.stats.windowStats[windowId];
    await this.saveStats();
  }

  async handleWindowFocusChanged(windowId) {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      this.stats.lastActivity = Date.now();
      await this.saveStats();
    }
  }

  // Storage change handler
  async handleStorageChanged(changes, namespace) {
    if (namespace === 'sync' && changes.settings) {
      this.settings = { ...this.settings, ...changes.settings.newValue };
      this.setupContextMenu();
      this.setupAlarms();
    }
  }

  // Command handler
  async handleCommand(command) {
    try {
      switch (command) {
        case 'open_side_panel':
          await this.openSidePanel();
          break;
        case 'quick_search':
          await this.quickSearch();
          break;
        case 'focus_search':
          await this.focusSearch();
          break;
        default:
          console.log('Unknown command:', command);
      }
    } catch (error) {
      console.error('Failed to handle command:', error);
    }
  }

  // Context menu handler
  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'clarity-close-duplicates':
          await this.closeDuplicateTabs(tab.windowId);
          break;
        case 'clarity-close-left':
          await this.closeTabsToLeft(tab);
          break;
        case 'clarity-close-right':
          await this.closeTabsToRight(tab);
          break;
        case 'clarity-close-others':
          await this.closeOtherTabs(tab);
          break;
        case 'clarity-move-new-window':
          await this.moveTabToNewWindow(tab.id);
          break;
        case 'clarity-merge-windows':
          await this.mergeAllWindows();
          break;
        case 'clarity-merge-windows-groups':
          await this.mergeWindowsAsGroups();
          break;
        case 'clarity-stats':
          await this.showStatistics(tab);
          break;
        default:
          console.log('Unknown context menu item:', info.menuItemId);
      }
    } catch (error) {
      console.error('Failed to handle context menu click:', error);
    }
  }

  // Action methods
  async closeDuplicateTabs(windowId) {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      const seenUrls = new Set();
      const tabsToClose = [];
      
      tabs.forEach(tab => {
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

  async closeTabsToLeft(tab) {
    try {
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const tabsToClose = tabs.filter(t => t.index < tab.index && !t.pinned);
      const tabIds = tabsToClose.map(t => t.id);
      
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
      }
    } catch (error) {
      console.error('Failed to close tabs to left:', error);
    }
  }

  async closeTabsToRight(tab) {
    try {
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const tabsToClose = tabs.filter(t => t.index > tab.index);
      const tabIds = tabsToClose.map(t => t.id);
      
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
      }
    } catch (error) {
      console.error('Failed to close tabs to right:', error);
    }
  }

  async closeOtherTabs(tab) {
    try {
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      const tabsToClose = tabs.filter(t => t.id !== tab.id && !t.pinned);
      const tabIds = tabsToClose.map(t => t.id);
      
      if (tabIds.length > 0) {
        await chrome.tabs.remove(tabIds);
      }
    } catch (error) {
      console.error('Failed to close other tabs:', error);
    }
  }

  async moveTabToNewWindow(tabId) {
    try {
      await chrome.windows.create({ tabId });
    } catch (error) {
      console.error('Failed to move tab to new window:', error);
    }
  }

  async mergeAllWindows() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      if (windows.length <= 1) return;
      
      const targetWindow = windows[0];
      const tabsToMove = [];
      
      for (let i = 1; i < windows.length; i++) {
        tabsToMove.push(...windows[i].tabs);
      }
      
      const tabIds = tabsToMove.map(t => t.id);
      await chrome.tabs.move(tabIds, { windowId: targetWindow.id, index: -1 });
      
      // Close empty windows
      for (let i = 1; i < windows.length; i++) {
        await chrome.windows.remove(windows[i].id);
      }
    } catch (error) {
      console.error('Failed to merge windows:', error);
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
        
        // Update statistics
        this.stats.lastActivity = Date.now();
        await this.saveStats();
      }
    } catch (error) {
      console.error('Failed to merge windows as groups:', error);
      this.showNotification('Failed to merge windows', 'error');
    }
  }

  async showStatistics(tab) {
    try {
      // Open side panel first
      if (tab && tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
      
      // Send message to side panel to show statistics (with delay to allow panel to load)
      setTimeout(async () => {
        try {
          await chrome.runtime.sendMessage({ action: 'showStatistics' });
        } catch (error) {
          console.error('Failed to send message to side panel:', error);
          this.showNotification('Failed to open statistics', 'error');
        }
      }, 500);
      
      // Show brief notification as confirmation
      this.showNotification('Opening statistics...');
    } catch (error) {
      console.error('Failed to show statistics:', error);
      this.showNotification('Failed to open statistics', 'error');
    }
  }

  async openSidePanel() {
    try {
      await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  }

  async quickSearch() {
    try {
      await this.openSidePanel();
      // Send message to side panel to focus search
      chrome.runtime.sendMessage({ action: 'focusSearch' });
    } catch (error) {
      console.error('Failed to quick search:', error);
    }
  }

  async focusSearch() {
    // This would be handled by the side panel
    console.log('Focus search requested');
  }

  // Utility methods
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return 'unknown';
    }
  }

  updateDomainStats(domain, action) {
    if (!this.stats.domainStats[domain]) {
      this.stats.domainStats[domain] = {
        created: 0,
        updated: 0,
        lastAccessed: Date.now()
      };
    }
    
    this.stats.domainStats[domain][action]++;
    this.stats.domainStats[domain].lastAccessed = Date.now();
  }

  async updateWindowStats(windowId) {
    try {
      const tabs = await chrome.tabs.query({ windowId });
      if (this.stats.windowStats[windowId]) {
        this.stats.windowStats[windowId].tabCount = tabs.length;
      }
    } catch (error) {
      console.error('Failed to update window stats:', error);
    }
  }

  async checkTabLimit(windowId) {
    if (!this.settings.enableTabLimit) return;
    
    try {
      const tabs = await chrome.tabs.query({ windowId });
      if (tabs.length > this.settings.maxTabsPerWindow) {
        this.showNotification(`Warning: ${tabs.length} tabs open (limit: ${this.settings.maxTabsPerWindow})`, 'warning');
      }
    } catch (error) {
      console.error('Failed to check tab limit:', error);
    }
  }

  async getDetailedStats() {
    const sessionDuration = Date.now() - this.stats.sessionStartTime;
    const windows = await chrome.windows.getAll({ populate: true });
    const totalTabs = windows.reduce((sum, window) => sum + window.tabs.length, 0);
    
    return {
      ...this.stats,
      sessionDuration: this.formatDuration(sessionDuration),
      currentTabs: totalTabs,
      currentWindows: windows.length,
      topDomains: this.getTopDomains()
    };
  }

  getTopDomains() {
    return Object.entries(this.stats.domainStats)
      .sort(([,a], [,b]) => b.created - a.created)
      .slice(0, 10)
      .map(([domain, stats]) => ({ domain, ...stats }));
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  async showNotification(message, type = 'info') {
    // Check if notifications are enabled
    if (!this.settings.enableNotifications) {
      return;
    }
    
    // Create notification for background operations
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/icons/icon-48.png',
      title: 'Clarity Tab Manager',
      message: message
    });
  }

  // Alarm handler
  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'cleanup':
        await this.performCleanup();
        break;
      case 'update-stats':
        await this.updateAllStats();
        break;
    }
  }

  async performCleanup() {
    try {
      const windows = await chrome.windows.getAll({ populate: true });
      const now = Date.now();
      const tabsToClose = [];
      
      windows.forEach(window => {
        window.tabs.forEach(tab => {
          if (!tab.active && !tab.pinned && (now - tab.lastAccessed) > this.settings.maxTabAge) {
            tabsToClose.push(tab.id);
          }
        });
      });
      
      if (tabsToClose.length > 0) {
        await chrome.tabs.remove(tabsToClose);
        console.log(`Auto-cleanup: closed ${tabsToClose.length} old tabs`);
      }
    } catch (error) {
      console.error('Failed to perform cleanup:', error);
    }
  }

  async updateAllStats() {
    try {
      const windows = await chrome.windows.getAll({ populate: false });
      this.stats.windowStats = {};
      
      windows.forEach(window => {
        this.stats.windowStats[window.id] = {
          created: window.created || Date.now(),
          tabCount: 0
        };
      });
      
      // Update stats for each window individually
      for (const windowId of Object.keys(this.stats.windowStats)) {
        await this.updateWindowStats(parseInt(windowId));
      }
      
      await this.saveStats();
    } catch (error) {
      console.error('Failed to update all stats:', error);
    }
  }
}

// Initialize the service worker
chrome.runtime.onStartup.addListener(() => {
  new ClarityServiceWorker();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const serviceWorker = new ClarityServiceWorker();
  serviceWorker.handleContextMenuClick(info, tab);
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  const serviceWorker = new ClarityServiceWorker();
  serviceWorker.handleAlarm(alarm);
});

// Initialize immediately
new ClarityServiceWorker();
