// modules/api.js

import { saveToQueryLog } from './history.js';

// Define the custom error class. It is exported at the bottom.
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Fetches the list of models available for the user's API key
async function listAvailableModels() {
  const { geminiApiKey } = await chrome.storage.sync.get(['geminiApiKey']);
  if (!geminiApiKey) throw new Error("API Key not set.");

  const LIST_MODELS_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
  
  const response = await fetch(LIST_MODELS_URL);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to fetch model list.");
  }

  // Filter for models that support 'generateContent' and are not 'embedding' models
  const supportedModels = data.models.filter(model => 
    model.supportedGenerationMethods.includes("generateContent") &&
    !model.name.includes("embedding") &&
    !model.name.includes("aqa")
  );
  
  return supportedModels.map(model => ({
      id: model.name.replace('models/', ''),
      name: model.displayName
  }));
}

// Handles all calls to the Gemini API
async function callGeminiAPI(history, imageData = null) {
  const settings = await chrome.storage.sync.get(['geminiApiKey', 'selectedModel']);
  if (!settings.geminiApiKey) throw new Error("API Key not found. Please set it in the extension options.");

  const modelName = settings.selectedModel || 'gemini-1.5-flash-latest';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${settings.geminiApiKey}`;
  
  let historyToSend = JSON.parse(JSON.stringify(history));

  if (imageData) {
    for (let i = historyToSend.length - 1; i >= 0; i--) {
        if (historyToSend[i].role === 'user') {
            historyToSend[i].parts.push({
                inline_data: { mime_type: "image/jpeg", data: imageData.split(',')[1] }
            });
            break;
        }
    }
  }

  const response = await fetch(API_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ contents: historyToSend }) 
  });
  
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || `HTTP error! status: ${response.status}`;
    if (response.status === 429) {
        throw new RateLimitError(errorMessage);
    }
    throw new Error(errorMessage);
  }

  if (data.candidates && data.candidates.length > 0 && data.candidates[0].content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  } else {
    const reason = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Unknown reason';
    throw new Error(`Gemini returned no content. Reason: ${reason}`);
  }
}

// Handles follow-up queries, including saving history
async function handleFollowUp(history, imageData) {
  const response = await callGeminiAPI(history, imageData);
  history.push({ role: 'model', parts: [{ text: response }] });
  
  await chrome.storage.local.set({ conversationHistory: history });
  
  const userPrompt = history[history.length - 2].parts[0].text;
  saveToQueryLog(userPrompt, response);
  
  return response;
}

// A single, clean export statement for all functions and classes in this module.
export { callGeminiAPI, handleFollowUp, RateLimitError, listAvailableModels };