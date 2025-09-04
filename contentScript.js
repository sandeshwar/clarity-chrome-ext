let gridIframe = null;
let smartSwitcherIframe = null;
let actionsIframe = null;
let aiAssistantIframe = null;

// --- Message Listeners ---

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'clarity:toggle-grid':
            toggleGrid();
            break;
        case 'clarity:toggle-smart-switcher':
            toggleSmartSwitcher();
            break;
        case 'clarity:toggle-actions-sidebar':
            toggleActionsSidebar();
            break;
        case 'clarity:toggle-ai-assistant':
            toggleAiAssistant();
            break;
    }
    sendResponse({ status: 'ok' });
});

// Listen for messages from our iframes (to close them)
window.addEventListener('message', (event) => {
    if (!event.source) return;

    if (gridIframe && event.source === gridIframe.contentWindow && event.data.type === 'clarity:close-grid') {
        closeGrid();
    } else if (smartSwitcherIframe && event.source === smartSwitcherIframe.contentWindow && event.data.type === 'clarity:close-smart-switcher') {
        closeSmartSwitcher();
    } else if (actionsIframe && event.source === actionsIframe.contentWindow && event.data.type === 'clarity:close-actions-sidebar') {
        closeActionsSidebar();
    } else if (aiAssistantIframe && event.source === aiAssistantIframe.contentWindow && event.data.type === 'clarity:close-ai-assistant') {
        closeAiAssistant();
    }
});

// --- UI Management Functions ---

function closeGrid() {
    if (gridIframe) {
        gridIframe.remove();
        gridIframe = null;
    }
}

function closeSmartSwitcher() {
    if (smartSwitcherIframe) {
        smartSwitcherIframe.remove();
        smartSwitcherIframe = null;
    }
}

function closeActionsSidebar() {
    if (actionsIframe) {
        actionsIframe.remove();
        actionsIframe = null;
    }
}

function closeAiAssistant() {
    if (aiAssistantIframe) {
        aiAssistantIframe.remove();
        aiAssistantIframe = null;
    }
}

function toggleGrid() {
    if (gridIframe) {
        closeGrid();
        return;
    }
    closeSmartSwitcher(); // Close other overlays if open
    closeActionsSidebar();
    gridIframe = createIframe('switcher.html', {
        width: '100%',
        height: '100%'
    });
    document.body.appendChild(gridIframe);
}

function toggleSmartSwitcher() {
    if (smartSwitcherIframe) {
        // If it's already open, just focus it to handle key events
        smartSwitcherIframe.focus();
        return;
    }
    closeGrid(); // Close other overlays if open
    closeActionsSidebar();
    smartSwitcherIframe = createIframe('smart-switcher.html', {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent' // The switcher itself has a background
    });
    document.body.appendChild(smartSwitcherIframe);
}

function toggleActionsSidebar() {
    if (actionsIframe) {
        closeActionsSidebar();
        return;
    }
    closeGrid(); // Close other overlays if open
    closeSmartSwitcher();
    closeAiAssistant();
    actionsIframe = createIframe('actions.html', {
        width: '280px',
        height: '100%',
        position: 'right',
        backgroundColor: 'transparent'
    });
    document.body.appendChild(actionsIframe);
}

function toggleAiAssistant() {
    if (aiAssistantIframe) {
        closeAiAssistant();
        return;
    }
    // Close other overlays
    closeGrid();
    closeSmartSwitcher();
    closeActionsSidebar();

    aiAssistantIframe = createIframe('ai-assistant.html', {
        width: '370px', // width + padding
        height: '520px', // height + padding
        position: 'bottom-right',
        backgroundColor: 'transparent'
    });
    document.body.appendChild(aiAssistantIframe);
}

function createIframe(src, styles) {
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL(src);
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    if (styles.position === 'right') {
        iframe.style.right = '0';
    } else if (styles.position === 'bottom-right') {
        iframe.style.bottom = '0';
        iframe.style.right = '0';
    } else {
        iframe.style.left = '0';
    }
    iframe.style.border = 'none';
    iframe.style.zIndex = '2147483647';
    iframe.style.backgroundColor = styles.backgroundColor || 'rgba(0,0,0,0.8)';
    iframe.style.width = styles.width || '100%';
    iframe.style.height = styles.height || '100%';
    return iframe;
}
