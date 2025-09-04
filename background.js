// --- Tab Spaces Management --- //

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case 'clarity:get-spaces': {
        const groups = await chrome.tabGroups.query({});
        sendResponse(groups);
        break;
      }
      case 'clarity:create-space': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          const newGroupId = await chrome.tabs.group({ tabIds: [activeTab.id] });
          await chrome.tabGroups.update(newGroupId, { title: message.title || "New Space" });
          const groups = await chrome.tabGroups.query({});
          sendResponse(groups); // Return updated list of groups
        }
        break;
      }
       case 'clarity:get-tabs-for-space': {
        const tabs = await chrome.tabs.query({ groupId: message.groupId });
        sendResponse(tabs);
        break;
      }
      case 'clarity:get-all-tabs': {
        const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        sendResponse(tabs);
        break;
      }
      case 'clarity:get-all-tabs-for-switcher': {
        const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
        tabs.sort((a, b) => a.index - b.index);
        sendResponse(tabs);
        break;
      }
      case 'clarity:ai-query': {
        // Mock AI response for now
        const query = message.query.toLowerCase();
        let reply = "I'm not sure how to help with that yet. You can ask me to 'find tab', 'close tab', or 'how many tabs' you have open.";

        if (query.includes('close tab')) {
          reply = "I can do that. Which tab would you like to close? Please provide a title or URL.";
        } else if (query.includes('find tab') || query.includes('search for')) {
          reply = "I can search for tabs. What are you looking for?";
        } else if (query.includes('how many tabs')) {
            const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
            reply = `You currently have ${tabs.length} tabs open.`;
        } else if (query.includes('summarize')) {
            reply = "I can't summarize pages yet, but that's a great idea for a future update!";
        }
        
        sendResponse({ reply: reply });
        break;
      }
      case 'clarity:perform-action': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        switch (message.action) {
          case 'new-tab':
            chrome.tabs.create({});
            break;
          case 'bookmark':
            if (tab) chrome.bookmarks.create({ title: tab.title, url: tab.url });
            break;
          case 'history':
            chrome.tabs.create({ url: 'chrome://history' });
            break;
          case 'downloads':
            chrome.tabs.create({ url: 'chrome://downloads' });
            break;
          case 'extensions':
            chrome.tabs.create({ url: 'chrome://extensions' });
            break;
          case 'settings':
            chrome.tabs.create({ url: 'chrome://settings' });
            break;
        }
        sendResponse({status: 'ok'});
        break;
      }
    }
  })();
  return true; // Indicates that the response is sent asynchronously
});

// Listen for commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // Prevent running on special pages where content scripts can't be injected
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:'))) {
    console.warn(`Clarity commands are not available on this page: ${tab.url}`);
    return;
  }

  const message = {
    'toggle-grid': { type: 'clarity:toggle-grid' },
    'open-smart-switcher': { type: 'clarity:toggle-smart-switcher' },
    'toggle-actions-sidebar': { type: 'clarity:toggle-actions-sidebar' },
    'open-ai-assistant': { type: 'clarity:toggle-ai-assistant' },
  }[command];

  if (message) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      if (e.message.includes('Receiving end does not exist')) {
        console.warn(`Clarity content script not ready on tab ${tab.id}. It may need to be reloaded.`);
      } else {
        console.error(`Error handling command '${command}':`, e);
      }
    }
  }
});

// --- Thumbnail Caching --- //

const captureVisibleTab = async (tabId, windowId) => {
  try {
    const imageUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 });
    await chrome.storage.local.set({ [`thumbnail_${tabId}`]: imageUrl });
  } catch (e) {
    console.warn(`Could not capture tab ${tabId}:`, e.message);
  }
};

// Capture tab when it becomes active
chrome.tabs.onActivated.addListener(activeInfo => {
  captureVisibleTab(activeInfo.tabId, activeInfo.windowId);
});

// Capture tab when it's finished loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    captureVisibleTab(tabId, tab.windowId);
  }
});

// Clean up storage when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(`thumbnail_${tabId}`);
});
