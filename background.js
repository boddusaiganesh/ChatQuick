
// background.js (Refactored to use HTML templates)

// --- MODULE IMPORTS ---
import { callGeminiAPI, handleFollowUp, RateLimitError, listAvailableModels } from './modules/api.js';
import { saveToQueryLog, clearCurrentConversation } from './modules/history.js';
import { handleCaptureRequest, handleCaptureComplete, handleCropComplete } from './modules/screenshot.js';
import { showToastIndicator, removeToastIndicator } from './modules/toast.js';

// --- HELPER TO INJECT AND RUN THE CHAT WINDOW ---
async function showChatWindow(tabId, history, isModelProblem = false) {
    // This function is unchanged
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { const e=document.getElementById("gemini-popup-container");e&&e.remove() } });
    const templateURL = chrome.runtime.getURL('chat_window.html');
    const response = await fetch(templateURL);
    const htmlTemplate = await response.text();
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["libs/bootstrap.min.css", "popup.css", "ui_styles.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, func: (html) => { document.body.insertAdjacentHTML('beforeend', html); }, args: [htmlTemplate] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['libs/purify.min.js', 'libs/marked.min.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['chat_window_logic.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, func: (h, p) => { document.dispatchEvent(new CustomEvent('gemini-init-chat-window', { detail: { initialHistory: h, isModelProblem: p } })) }, args: [history, isModelProblem] });
}

// --- EVENT LISTENERS ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "gemini-query", title: 'Ask Gemini about "%s"', contexts: ["selection"] });
});

// **** THIS IS THE FIX ****
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Add a check to ensure we are not on a restricted page.
  if (tab.url.startsWith('chrome://')) {
    console.log("Cannot run on a chrome:// page.");
    return;
  }

  if (info.menuItemId === "gemini-query" && info.selectionText) {
    const { showToastIndicator: shouldShowToast } = await chrome.storage.sync.get({ showToastIndicator: true });
    if (shouldShowToast) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showToastIndicator });
    }
    processNewQuery(info.selectionText, tab);
  }
});

// **** THIS IS THE FIX ****
chrome.commands.onCommand.addListener(async (command, tab) => {
  // Add a check to ensure we are not on a restricted page.
  if (tab.url.startsWith('chrome://')) {
    console.log("Cannot run on a chrome:// page.");
    return;
  }
  
  if (command === "ask-gemini-shortcut") {
    const { showToastIndicator: shouldShowToast } = await chrome.storage.sync.get({ showToastIndicator: true });
    if (shouldShowToast) {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showToastIndicator });
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    }, async (injectionResults) => {
      // Check if the script execution failed (e.g., on a restricted page)
      if (chrome.runtime.lastError) {
          console.log(`Error executing script: ${chrome.runtime.lastError.message}`);
          return;
      }
      const selectedText = injectionResults?.[0]?.result;
      if (selectedText) {
        processNewQuery(selectedText, tab);
      } else {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: removeToastIndicator });
        const { conversationHistory } = await chrome.storage.local.get({ conversationHistory: [] });
        showChatWindow(tab.id, conversationHistory);
      }
    });
  }
});

// The rest of the file is unchanged.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'geminiFollowUp') {
    handleFollowUp(message.history, message.imageData)
      .then(response => sendResponse({ success: true, response: response }))
      .catch(error => {
        const isRateLimit = error instanceof RateLimitError;
        const isModelError = !isRateLimit && /model/i.test(error.message);
        sendResponse({ success: false, error: error.message, isModelProblem: isRateLimit || isModelError });
      });
    return true;
  }
  if (message.type === 'saveModelAndRetry') {
    chrome.storage.sync.set({ selectedModel: message.newModel }).then(() => {
      const lastUserEntry = message.history.findLast(m => m.role === 'user');
      if (lastUserEntry) {
        processNewQuery(lastUserEntry.parts[0].text, sender.tab, true);
      }
    });
    return true;
  }
  if (message.type === 'fetchModels') { listAvailableModels().then(models => sendResponse({ success: true, models })).catch(err => sendResponse({ success: false, error: err.message })); return true; }
  if (message.type === 'clearChatHistory') { clearCurrentConversation(); }
  if (message.type === 'initiateCapture') { handleCaptureRequest(sender.tab); }
  if (message.type === 'captureComplete') { handleCaptureComplete(message.area, sender.tab, message.devicePixelRatio); }
  if (message.type === 'cropComplete') { handleCropComplete(message.imageData); }
});

async function processNewQuery(promptText, tab, isRetry = false) {
  try {
    const data = await chrome.storage.local.get({ conversationHistory: [] });
    let history = data.conversationHistory;
    
    let finalPrompt;
    if (isRetry) {
        finalPrompt = promptText;
    } else {
        const defaultPromptTemplate = 'Please explain this concept or term concisely: "{{text}}"';
        const { customPrompt } = await chrome.storage.sync.get({ customPrompt: defaultPromptTemplate });
        finalPrompt = customPrompt.replace('{{text}}', promptText);
    }

    if (isRetry && history.length > 0 && history[history.length - 1].role === 'user') {
      history[history.length - 1].parts[0].text = finalPrompt;
    } else {
      history.push({ role: 'user', parts: [{ text: finalPrompt }] });
    }

    const response = await callGeminiAPI(history);
    history.push({ role: 'model', parts: [{ text: response }] });
    await chrome.storage.local.set({ conversationHistory: history });
    saveToQueryLog(finalPrompt, response);

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: removeToastIndicator });
    
    showChatWindow(tab.id, history);

  } catch (error) {
    console.error("Error during query:", error);
    // Add a guard here to avoid trying to inject into a restricted page on error
    if (tab.url.startsWith('chrome://')) {
        console.error("Cannot show error UI on a chrome:// page.");
        return;
    }

    const isRateLimit = error instanceof RateLimitError;
    const isModelError = !isRateLimit && /model|permission/i.test(error.message);
    const finalErrorMsg = (isRateLimit || isModelError) ? `The selected model failed. Please choose another.` : `Error: ${error.message}`;
    
    let historyForPopup = (await chrome.storage.local.get({ conversationHistory: [] })).conversationHistory;
    
    let lastUserPrompt;
    if (isRetry) {
        lastUserPrompt = promptText;
    } else {
        const defaultPromptTemplate = 'Please explain this concept or term concisely: "{{text}}"';
        const { customPrompt } = await chrome.storage.sync.get({ customPrompt: defaultPromptTemplate });
        lastUserPrompt = customPrompt.replace('{{text}}', promptText);
    }

    if (!isRetry) {
        historyForPopup.push({ role: 'user', parts: [{text: lastUserPrompt }]});
    }
    historyForPopup.push({ role: 'model', parts: [{text: finalErrorMsg}]});

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: removeToastIndicator });
    
    showChatWindow(tab.id, historyForPopup, isRateLimit || isModelError);
  }
}