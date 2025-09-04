document.addEventListener('DOMContentLoaded', () => {
  const actionsContainer = document.getElementById('actions-container');

  actionsContainer.addEventListener('click', (e) => {
    if (e.target && e.target.matches('li[data-action]')) {
      const action = e.target.dataset.action;
      chrome.runtime.sendMessage({ type: 'clarity:perform-action', action });
      // Close the sidebar after an action is performed
      window.parent.postMessage({ type: 'clarity:close-actions-sidebar' }, '*');
    }
  });

  // Close sidebar on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.parent.postMessage({ type: 'clarity:close-actions-sidebar' }, '*');
    }
  });
});
