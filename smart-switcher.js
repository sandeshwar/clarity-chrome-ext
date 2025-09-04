document.addEventListener('DOMContentLoaded', async () => {
    const tabsList = document.getElementById('tabs-list');
    let tabs = [];
    let activeTabIndex = 0;

    async function initialize() {
        tabs = await chrome.runtime.sendMessage({ type: 'clarity:get-all-tabs-for-switcher' });
        const activeTab = tabs.find(tab => tab.active);
        activeTabIndex = activeTab ? tabs.indexOf(activeTab) : 0;
        renderTabs();
    }

    function renderTabs() {
        tabsList.innerHTML = '';
        tabs.forEach((tab, index) => {
            const tabItem = document.createElement('div');
            tabItem.className = 'tab-item';
            tabItem.dataset.tabId = tab.id;

            const favicon = document.createElement('img');
            favicon.className = 'favicon';
            favicon.src = tab.favIconUrl || 'icons/icon16.png';

            const title = document.createElement('span');
            title.className = 'title';
            title.textContent = tab.title;

            tabItem.appendChild(favicon);
            tabItem.appendChild(title);

            if (index === activeTabIndex) {
                tabItem.classList.add('active');
            }
            
            tabsList.appendChild(tabItem);
        });
        scrollToActiveTab();
    }

    function scrollToActiveTab() {
        const activeTabElement = tabsList.querySelector('.tab-item.active');
        if (activeTabElement) {
            activeTabElement.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest'
            });
        }
    }

    function navigate(direction) {
        activeTabIndex += direction;
        if (activeTabIndex < 0) {
            activeTabIndex = tabs.length - 1;
        }
        if (activeTabIndex >= tabs.length) {
            activeTabIndex = 0;
        }
        renderTabs();
    }

    function switchToActiveTab() {
        const activeTab = tabs[activeTabIndex];
        if (activeTab) {
            chrome.tabs.update(activeTab.id, { active: true });
            chrome.windows.update(activeTab.windowId, { focused: true });
            window.parent.postMessage({ type: 'clarity:close-smart-switcher' }, '*');
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault();
            navigate(1);
        } else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
            e.preventDefault();
            navigate(-1);
        } else if (e.key === 'Enter') {
            switchToActiveTab();
        } else if (e.key === 'Escape') {
            window.parent.postMessage({ type: 'clarity:close-smart-switcher' }, '*');
        }
    });
    
    // This is a common pattern for alt-tab like switchers.
    // The switcher is closed when the modifier key (Alt or Ctrl) is released.
    document.addEventListener('keyup', (e) => {
        if (e.key === 'Control' || e.key === 'Shift') { // Matches manifest command
            switchToActiveTab();
        }
    });

    initialize();
});
