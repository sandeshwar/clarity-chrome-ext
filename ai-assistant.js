document.addEventListener('DOMContentLoaded', () => {
  const messageList = document.getElementById('message-list');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const closeBtn = document.getElementById('close-btn');

  // Function to add a message to the chat window
  const addMessage = (text, sender) => {
    const message = document.createElement('div');
    message.classList.add('message', sender);
    message.textContent = text;
    messageList.appendChild(message);
    messageList.scrollTop = messageList.scrollHeight; // Auto-scroll to bottom
  };

  // Handle sending a message
  const sendMessage = () => {
    const text = messageInput.value.trim();
    if (text === '') return;

    addMessage(text, 'user');
    messageInput.value = '';

    // Send message to background script for processing
    chrome.runtime.sendMessage({ type: 'clarity:ai-query', query: text }, (response) => {
        if (response && response.reply) {
            addMessage(response.reply, 'assistant');
        } else {
            addMessage('Sorry, I had trouble getting a response.', 'assistant');
        }
    });
  };

  // Event Listeners
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ type: 'clarity:close-ai-assistant' }, '*');
  });

  // Add a welcome message
  addMessage('Hello! How can I help you with your tabs today?', 'assistant');
});
