// modules/history.js

// Saves a single query to the long-term log for history.html
function saveToQueryLog(prompt, response) {
  const newHistoryItem = { prompt, response, timestamp: new Date().toISOString() };
  chrome.storage.local.get({ queryHistory: [] }, (data) => {
    const history = data.queryHistory;
    history.unshift(newHistoryItem);
    if (history.length > 100) history.pop();
    chrome.storage.local.set({ queryHistory: history });
  });
}

// Clears the current active conversation
async function clearCurrentConversation() {
  await chrome.storage.local.set({ conversationHistory: [] });
  console.log('Chat history cleared.');
}

export { saveToQueryLog, clearCurrentConversation };