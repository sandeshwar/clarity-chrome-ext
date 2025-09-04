document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('grid-container');
    const searchInput = document.getElementById('search-input');
    const spacesList = document.getElementById('spaces-list');
    const addSpaceBtn = document.getElementById('add-space-btn');

    let allTabsInCurrentView = [];
    let currentSpaceId = null; // null represents "All Tabs"

    // --- Initial Load ---

    async function initialize() {
        await renderSpaces();
        await loadAndRenderTabs();
    }

    // --- Tab Rendering ---

    async function renderTabs(tabs) {
        gridContainer.innerHTML = '';
        const storageKeys = tabs.map(tab => `thumbnail_${tab.id}`);
        const thumbnails = await chrome.storage.local.get(storageKeys);

        tabs.forEach(tab => {
            const tabCard = document.createElement('div');
            tabCard.className = 'tab-card';
            tabCard.dataset.tabId = tab.id;

            const title = document.createElement('span');
            title.className = 'title';
            title.textContent = tab.title;

            const favicon = document.createElement('img');
            favicon.className = 'favicon';
            favicon.src = tab.favIconUrl || 'icons/icon16.png';

            const titleContainer = document.createElement('div');
            titleContainer.style.display = 'flex';
            titleContainer.style.alignItems = 'center';
            titleContainer.appendChild(favicon);
            titleContainer.appendChild(title);

            const thumbnail = document.createElement('div');
            thumbnail.className = 'thumbnail';
            
            const thumbnailUrl = thumbnails[`thumbnail_${tab.id}`];
            if (thumbnailUrl) {
                thumbnail.style.backgroundImage = `url(${thumbnailUrl})`;
            } else {
                thumbnail.style.backgroundColor = '#333'; // Placeholder color
            }

            tabCard.appendChild(titleContainer);
            tabCard.appendChild(thumbnail);

            tabCard.addEventListener('click', async () => {
                await chrome.tabs.update(tab.id, { active: true });
                await chrome.windows.update(tab.windowId, { focused: true });
                window.parent.postMessage({ type: 'clarity:close-grid' }, '*');
            });

            gridContainer.appendChild(tabCard);
        });
    }

    async function loadAndRenderTabs() {
        let tabs;
        if (currentSpaceId === null) {
            tabs = await chrome.runtime.sendMessage({ type: 'clarity:get-all-tabs' });
        } else {
            tabs = await chrome.runtime.sendMessage({ type: 'clarity:get-tabs-for-space', groupId: currentSpaceId });
        }
        allTabsInCurrentView = tabs;
        renderTabs(tabs);
    }

    // --- Space Rendering and Management ---

    async function renderSpaces() {
        const spaces = await chrome.runtime.sendMessage({ type: 'clarity:get-spaces' });
        spacesList.innerHTML = '';

        // Add "All Tabs" option
        const allTabsItem = createSpaceItem('All Tabs', null);
        spacesList.appendChild(allTabsItem);

        // Add each space
        spaces.forEach(space => {
            const spaceItem = createSpaceItem(space.title, space.id);
            spacesList.appendChild(spaceItem);
        });
        
        updateActiveSpaceSelection();
    }

    function createSpaceItem(name, id) {
        const spaceItem = document.createElement('li');
        spaceItem.textContent = name;
        spaceItem.dataset.spaceId = id === null ? 'null' : id;
        spaceItem.addEventListener('click', () => {
            currentSpaceId = id;
            loadAndRenderTabs();
            updateActiveSpaceSelection();
        });
        return spaceItem;
    }
    
    function updateActiveSpaceSelection() {
        const currentActive = spacesList.querySelector('.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }
        const newActive = spacesList.querySelector(`[data-space-id='${currentSpaceId === null ? 'null' : currentSpaceId}']`);
        if (newActive) {
            newActive.classList.add('active');
        }
    }


    // --- Event Listeners ---

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredTabs = allTabsInCurrentView.filter(tab =>
            tab.title.toLowerCase().includes(searchTerm) ||
            tab.url.toLowerCase().includes(searchTerm)
        );
        renderTabs(filteredTabs);
    });

    addSpaceBtn.addEventListener('click', async () => {
        const spaceName = prompt("Enter a name for the new space:", "New Space");
        if (spaceName) {
            await chrome.runtime.sendMessage({ type: 'clarity:create-space', title: spaceName });
            await renderSpaces(); // Re-render spaces to show the new one
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.parent.postMessage({ type: 'clarity:close-grid' }, '*');
        }
    });

    initialize();
});
