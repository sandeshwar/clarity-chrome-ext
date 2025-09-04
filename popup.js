document.addEventListener('DOMContentLoaded', () => {
  const buttons = {
    'toggle-grid': 'clarity:toggle-grid',
    'open-smart-switcher': 'clarity:toggle-smart-switcher',
    'toggle-actions': 'clarity:toggle-actions-sidebar',
    'open-ai-assistant': 'clarity:toggle-ai-assistant',
  };

  for (const [buttonId, messageType] of Object.entries(buttons)) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: messageType });
            window.close(); // Close popup after action
          } catch (e) {
            console.error(`Could not send message to content script: ${e.message}`);
            // Optionally, show an error message to the user in the popup
          }
        }
      });
    }
  }
});
