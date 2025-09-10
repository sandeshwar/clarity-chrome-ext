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

    function renderTabs(tabs) {
        gridContainer.innerHTML = '';
        tabs.forEach(tab => {
            const tabCard = createTabCard(tab);
            gridContainer.appendChild(tabCard);
            loadThumbnail(tab.id, tab.favIconUrl);
        });
    }

    function createTabCard(tab) {
        const tabCard = document.createElement('div');
        tabCard.className = 'tab-card';
        tabCard.dataset.tabId = tab.id;

        const favicon = document.createElement('img');
        favicon.className = 'favicon';
        favicon.src = tab.favIconUrl || 'icons/icon16.png';

        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = tab.title;

        const domain = document.createElement('span');
        domain.className = 'domain';
        try {
            domain.textContent = new URL(tab.url).hostname;
        } catch (e) {
            domain.textContent = '';
        }

        const textContainer = document.createElement('div');
        textContainer.className = 'text-container';
        textContainer.appendChild(title);
        textContainer.appendChild(domain);

        const headerContainer = document.createElement('div');
        headerContainer.className = 'tab-header';
        headerContainer.appendChild(favicon);
        headerContainer.appendChild(textContainer);

        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail';
        thumbnail.id = `thumbnail_${tab.id}`;

        tabCard.appendChild(headerContainer);
        tabCard.appendChild(thumbnail);

        tabCard.addEventListener('click', async () => {
            await chrome.tabs.update(tab.id, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
            window.parent.postMessage({ type: 'clarity:close-grid' }, '*');
        });

        return tabCard;
    }

    async function loadThumbnail(tabId, favIconUrl) {
        const key = `thumbnail_${tabId}`;
        const data = await chrome.storage.local.get(key);
        const thumbnailElement = document.getElementById(key);

        if (thumbnailElement && data[key]) {
            thumbnailElement.style.backgroundImage = `url(${data[key]})`;
            thumbnailElement.style.backgroundColor = 'transparent';
        } else if (thumbnailElement) {
            // Fallback to favicon gradient
            getDominantColor(favIconUrl, (color) => {
                if (color) {
                    const [r, g, b] = color;
                    thumbnailElement.style.background = `linear-gradient(135deg, rgba(${r},${g},${b},0.3) 0%, rgba(${r},${g},${b},0.1) 100%)`;
                }
            });
        }
    }

    function getDominantColor(imageUrl, callback) {
        if (!imageUrl || imageUrl.startsWith('chrome://')) {
            callback(null);
            return;
        }

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            try {
                const data = ctx.getImageData(0, 0, img.width, img.height).data;
                let r = 0, g = 0, b = 0;
                let count = 0;

                for (let i = 0; i < data.length; i += 4) {
                    // Ignore transparent pixels
                    if (data[i + 3] > 0) {
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        count++;
                    }
                }

                if (count > 0) {
                    r = Math.floor(r / count);
                    g = Math.floor(g / count);
                    b = Math.floor(b / count);
                    callback([r, g, b]);
                } else {
                    callback(null);
                }
            } catch (e) {
                console.warn("Could not get dominant color from favicon:", e);
                callback(null);
            }
        };
        img.onerror = () => {
            callback(null);
        };
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

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            for (const key in changes) {
                if (key.startsWith('thumbnail_')) {
                    const tabId = parseInt(key.split('_')[1]);
                    const thumbnailElement = document.getElementById(key);
                    if (thumbnailElement && changes[key].newValue) {
                        thumbnailElement.style.backgroundImage = `url(${changes[key].newValue})`;
                        thumbnailElement.style.backgroundColor = 'transparent';
                    } else if (thumbnailElement) {
                        thumbnailElement.style.backgroundImage = '';
                        thumbnailElement.style.backgroundColor = '#3a3a3a';
                    }
                }
            }
        }
    });

    initialize();
});
