
function populateModelSelector(models, selectedModelId) {
    const select = document.getElementById('model-select');
    select.innerHTML = ''; 

    if (!models || models.length === 0) {
        const option = document.createElement('option');
        option.textContent = 'Click "Refresh List" with a valid API key';
        option.disabled = true;
        select.appendChild(option);
        return;
    }

    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        select.appendChild(option);
    });

    if (selectedModelId) {
        select.value = selectedModelId;
    }
}

async function refreshModels() {
    const refreshBtn = document.getElementById('refresh-models');
    const originalText = refreshBtn.textContent;
    refreshBtn.textContent = 'Fetching...';
    refreshBtn.disabled = true;

    try {
        const response = await chrome.runtime.sendMessage({ type: 'fetchModels' });
        if (response.success) {
            await chrome.storage.local.set({ availableModels: response.models });
            const settings = await chrome.storage.sync.get('selectedModel');
            populateModelSelector(response.models, settings.selectedModel);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        alert(`Could not fetch models: ${error.message}\n\nPlease ensure your API key is correct and saved before refreshing.`);
        populateModelSelector(null);
    } finally {
        refreshBtn.textContent = originalText;
        refreshBtn.disabled = false;
    }
}

function save_options() {
  const apiKey = document.getElementById('api-key').value;
  const stealthMode = document.getElementById('stealth-mode').checked;
  const selectedModel = document.getElementById('model-select').value;
  const showToast = document.getElementById('show-toast-indicator').checked;
  const customPrompt = document.getElementById('custom-prompt').value;
  // **** GET NEW SETTING ****
  const hideOnMinimize = document.getElementById('hide-on-minimize').checked;

  chrome.storage.sync.set({
    geminiApiKey: apiKey,
    stealthModeEnabled: stealthMode,
    selectedModel: selectedModel,
    showToastIndicator: showToast,
    customPrompt: customPrompt,
    // **** SAVE NEW SETTING ****
    hideOnMinimize: hideOnMinimize
  }, () => {
    const status = document.getElementById('status');
    status.textContent = 'Options saved.';
    setTimeout(() => { status.textContent = ''; }, 1500);
  });
}

async function restore_options() {
  const { availableModels } = await chrome.storage.local.get('availableModels');
  // **** ADD NEW KEY TO FETCH ****
  const syncSettings = await chrome.storage.sync.get([
      'geminiApiKey', 
      'stealthModeEnabled', 
      'selectedModel',
      'showToastIndicator',
      'customPrompt',
      'hideOnMinimize'
  ]);
  
  if (syncSettings.geminiApiKey) {
    document.getElementById('api-key').value = syncSettings.geminiApiKey;
  }
  document.getElementById('stealth-mode').checked = !!syncSettings.stealthModeEnabled;
  document.getElementById('show-toast-indicator').checked = syncSettings.showToastIndicator !== false;

  // **** RESTORE NEW SETTING ****
  document.getElementById('hide-on-minimize').checked = !!syncSettings.hideOnMinimize;

  const defaultPrompt = 'Please explain this concept or term concisely: "{{text}}"';
  document.getElementById('custom-prompt').value = syncSettings.customPrompt || defaultPrompt;

  populateModelSelector(availableModels, syncSettings.selectedModel);
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
document.getElementById('refresh-models').addEventListener('click', refreshModels);