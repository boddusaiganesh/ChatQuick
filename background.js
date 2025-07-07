
// background.js (Refactored to use HTML templates)

// --- MODULE IMPORTS ---
import { callGeminiAPI, handleFollowUp, RateLimitError, listAvailableModels } from './modules/api.js';
import { saveToQueryLog, clearCurrentConversation } from './modules/history.js';
import { handleCaptureRequest, handleCaptureComplete, handleCropComplete } from './modules/screenshot.js';
import { showToastIndicator, removeToastIndicator } from './modules/toast.js';

// --- HELPER TO INJECT AND RUN THE CHAT WINDOW ---
async function showChatWindow(tabId, history, isModelProblem = false) {
    // 1. Check if the UI already exists and remove it to prevent duplicates
    await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
            const oldContainer = document.getElementById('gemini-popup-container');
            if (oldContainer) oldContainer.remove();
        }
    });

    // 2. Fetch the HTML template
    const templateURL = chrome.runtime.getURL('chat_window.html');
    const response = await fetch(templateURL);
    const htmlTemplate = await response.text();

    // 3. Inject the CSS and the HTML template
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["libs/bootstrap.min.css", "popup.css", "ui_styles.css"] });
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (html) => { document.body.insertAdjacentHTML('beforeend', html); },
        args: [htmlTemplate]
    });
    
    // 4. Inject the logic libraries and script
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['libs/purify.min.js', 'libs/marked.min.js']
    });
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['chat_window_logic.js']
    });

    // 5. Dispatch a custom event with the necessary data
    await chrome.scripting.executeScript({
        target: { tabId },
        func: (history, isModelProblem) => {
            document.dispatchEvent(new CustomEvent('gemini-init-chat-window', {
                detail: { initialHistory: history, isModelProblem }
            }));
        },
        args: [history, isModelProblem]
    });
}

// --- EVENT LISTENERS ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "gemini-query", title: 'Ask Gemini about "%s"', contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (tab.url?.startsWith('chrome://')) {
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

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (tab.url?.startsWith('chrome://')) {
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

// **** MESSAGE LISTENER WITH THE FIX ****
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'geminiFollowUp') {
    handleFollowUp(message.history, message.imageData)
      .then(response => sendResponse({ success: true, response: response }))
      .catch(error => {
        const isRateLimit = error instanceof RateLimitError;
        const isModelError = !isRateLimit && /model/i.test(error.message);
        sendResponse({ success: false, error: error.message, isModelProblem: isRateLimit || isModelError });
      });
    return true; // Indicates an async response
  }
  
  if (message.type === 'saveModelAndRetry') {
    // Wrap in an async IIFE to use await
    (async () => {
        await chrome.storage.sync.set({ selectedModel: message.newModel });
        const lastUserEntry = message.history.findLast(m => m.role === 'user');
        if (!lastUserEntry) return;

        // 1. Prioritize the tab from the sender.
        let targetTab = sender.tab;

        // 2. If sender.tab is missing, query for the currently active tab as a fallback.
        if (!targetTab) {
            console.log("sender.tab not found, querying for active tab.");
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTab = tabs[0];
        }

        // 3. If we successfully found a tab, proceed.
        if (targetTab) {
            processNewQuery(lastUserEntry.parts[0].text, targetTab, true);
        } else {
            console.error("Could not find a target tab to retry the query on.");
        }
    })();
    return true; // Indicates an async response
  }

  if (message.type === 'fetchModels') { 
    listAvailableModels()
      .then(models => sendResponse({ success: true, models: models }))
      .catch(err => sendResponse({ success: false, error: err.message })); 
    return true; // Indicates an async response
  }
  
  if (message.type === 'clearChatHistory') { clearCurrentConversation(); }
  if (message.type === 'initiateCapture') { handleCaptureRequest(sender.tab); }
  if (message.type === 'captureComplete') { handleCaptureComplete(message.area, sender.tab, message.devicePixelRatio); }
  if (message.type === 'cropComplete') { handleCropComplete(message.imageData); }
});

// --- CORE LOGIC WORKFLOWS ---
async function processNewQuery(promptText, tab, isRetry = false) {
  // Defensive check for a valid tab object
  if (!tab || typeof tab.id === 'undefined') {
    console.error("processNewQuery called with an invalid tab object.", tab);
    return;
  }

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
    if (tab.url?.startsWith('chrome://')) {
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