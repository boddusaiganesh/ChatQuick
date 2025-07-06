
document.addEventListener('gemini-init-chat-window', (e) => {
    const { initialHistory, isModelProblem } = e.detail;

    // --- ELEMENT SELECTORS (Unchanged) ---
    const popupContainer = document.getElementById('gemini-popup-container');
    const contentDiv = document.getElementById('gemini-popup-content');
    const toolbar = document.getElementById('gemini-popup-toolbar');
    const clearButton = document.querySelector('.js-clear-chat');
    const captureButton = document.querySelector('.js-capture-area');
    const modelDisplayContainer = document.getElementById('gemini-model-display-container');
    const modelDisplay = document.getElementById('gemini-model-display');
    const modelDisplayText = modelDisplay.querySelector('span');
    const modelForm = document.getElementById('gemini-model-form');
    const modelSelect = document.getElementById('gemini-model-select-popup');
    const opacitySlider = document.getElementById('gemini-opacity-slider');
    const minimizeButton = document.querySelector('.js-minimize');
    const closeButton = document.querySelector('.js-close');
    const chatLog = document.getElementById('gemini-chat-log');
    const replyContextBar = document.getElementById('gemini-reply-context');
    const replyText = document.getElementById('gemini-reply-text');
    const cancelReplyBtn = document.getElementById('gemini-cancel-reply-btn');
    const chatForm = document.getElementById('gemini-chat-form');
    const chatInput = document.getElementById('gemini-chat-input');
    const minimizedBubble = document.getElementById('gemini-minimized-bubble');

    // --- UI STATE & DATA (Unchanged) ---
    let conversationHistory = initialHistory || [];
    let stealthModeEnabled = false;
    let capturedImageData = null;
    let activeReply = null;

    // --- HELPER FUNCTIONS & LISTENERS ---
    // Unchanged functions are collapsed for brevity
    const appendMessage = (role, text, imageUrl = null, visualOnly = false) => { if (!visualOnly) { conversationHistory.push({ role, parts: [{ text }] }); } const messageDiv = document.createElement('div'); messageDiv.className = `gemini-message ${role}-message`; const messageContent = document.createElement('span'); if (role === 'model' && window.marked && window.DOMPurify) { const unsafeHtml = window.marked.parse(text); messageContent.innerHTML = window.DOMPurify.sanitize(unsafeHtml); } else { messageContent.innerText = text; } messageDiv.appendChild(messageContent); if (imageUrl) { const img = document.createElement('img'); img.src = imageUrl; img.className = 'captured-image'; messageDiv.appendChild(img); } const replyBtn = document.createElement('button'); replyBtn.className = 'gemini-message-action-btn gemini-reply-btn'; replyBtn.innerHTML = '↩'; replyBtn.title = 'Reply'; replyBtn.onclick = (e) => { e.stopPropagation(); activeReply = { text }; replyText.innerText = `Replying to: "${text}"`; replyContextBar.classList.remove('gemini-hidden'); chatInput.focus(); }; messageDiv.appendChild(replyBtn); if (role === 'model') { const copyBtn = document.createElement('button'); copyBtn.className = 'gemini-message-action-btn gemini-copy-btn'; copyBtn.innerHTML = '📋'; copyBtn.title = 'Copy'; copyBtn.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(text).then(() => { copyBtn.innerHTML = '✓'; copyBtn.classList.add('copied'); setTimeout(() => { copyBtn.innerHTML = '📋'; copyBtn.classList.remove('copied'); }, 1500); }); }; messageDiv.appendChild(copyBtn); } chatLog.appendChild(messageDiv); chatLog.scrollTop = chatLog.scrollHeight; };
    const handleImageEvent = (e) => { capturedImageData = e.detail.imageData; contentDiv.classList.remove('gemini-hidden'); appendMessage('user', 'What do you want to know about this image?', capturedImageData, true); chatInput.focus(); };
    document.addEventListener('geminiImageCaptured', handleImageEvent);
    const handlePaste = (event) => { const items = (event.clipboardData || event.originalEvent.clipboardData).items; let imageFile = null; for (const item of items) { if (item.kind === 'file' && item.type.startsWith('image/')) { imageFile = item.getAsFile(); break; } } if (!imageFile) { return; } event.preventDefault(); const reader = new FileReader(); reader.onload = (e) => { const imageDataUrl = e.target.result; capturedImageData = imageDataUrl; appendMessage('user', 'What do you want to know about this pasted image?', imageDataUrl, true); chatInput.focus(); }; reader.readAsDataURL(imageFile); };
    chatInput.addEventListener('paste', handlePaste);
    
    let resizeTimeout;
    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            // **** THIS IS THE FIX (1/3) ****
            if (chrome.runtime?.id) {
                chrome.storage.local.set({
                    width: contentDiv.style.width,
                    height: contentDiv.style.height
                });
            }
        }, 300);
    });

    const performCleanup = () => { resizeObserver.disconnect(); clearTimeout(resizeTimeout); chatInput.removeEventListener('paste', handlePaste); popupContainer.remove(); document.removeEventListener('geminiImageCaptured', handleImageEvent); };
    closeButton.onclick = performCleanup;
    clearButton.onclick = () => { conversationHistory = []; chatLog.innerHTML = ''; chrome.runtime.sendMessage({ type: 'clearChatHistory' }); };
    const getReadableColor = (rgbString) => { if (!rgbString) return '#000000'; const match = rgbString.match(/\d+/g); if (!match) return '#000000'; const [r, g, b] = match.map(Number); const brightness = (r * 299 + g * 587 + b * 114) / 1000; return brightness > 125 ? '#000000' : '#FFFFFF'; };
    const findSolidBackgroundColor = (element) => { let currentElement = element; while (currentElement) { const bgColor = window.getComputedStyle(currentElement).backgroundColor; if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') { return bgColor; } currentElement = currentElement.parentElement; } return 'rgb(255, 255, 255)'; };
    minimizeButton.onclick = async () => { const { hideOnMinimize } = await chrome.storage.sync.get({ hideOnMinimize: false }); if (hideOnMinimize) { performCleanup(); } else { contentDiv.classList.add('gemini-hidden'); minimizedBubble.classList.remove('gemini-hidden'); if (stealthModeEnabled) { minimizedBubble.style.visibility = 'hidden'; setTimeout(() => { if (!chrome.runtime?.id) return; const bubbleRect = minimizedBubble.getBoundingClientRect(); const x = bubbleRect.left + bubbleRect.width / 2; const y = bubbleRect.top + bubbleRect.height / 2; const elementUnder = document.elementFromPoint(x, y); const bgColor = findSolidBackgroundColor(elementUnder); const iconColor = getReadableColor(bgColor); minimizedBubble.style.backgroundImage = 'none'; minimizedBubble.style.backgroundColor = bgColor; minimizedBubble.style.color = iconColor; minimizedBubble.style.border = `1px solid ${iconColor}`; minimizedBubble.style.visibility = 'visible'; }, 50); } } };
    let didDragBubble = false;
    minimizedBubble.onclick = () => { if (didDragBubble) { didDragBubble = false; return; } minimizedBubble.classList.add('gemini-hidden'); contentDiv.classList.remove('gemini-hidden'); minimizedBubble.style.backgroundImage = ''; minimizedBubble.style.backgroundColor = ''; minimizedBubble.style.color = ''; minimizedBubble.style.border = ''; };
    captureButton.onclick = () => { contentDiv.classList.add('gemini-hidden'); chrome.runtime.sendMessage({ type: 'initiateCapture' }); };
    cancelReplyBtn.onclick = () => { activeReply = null; replyContextBar.classList.add('gemini-hidden'); };
    modelDisplay.onclick = (e) => { e.stopPropagation(); const isHidden = modelForm.classList.toggle('gemini-hidden'); modelDisplay.classList.toggle('active', !isHidden); };
    document.addEventListener('click', (e) => { if (!modelDisplayContainer.contains(e.target)) { modelForm.classList.add('gemini-hidden'); modelDisplay.classList.remove('active'); } });
    chatForm.onsubmit = (e) => { e.preventDefault(); let userText = chatInput.value.trim(); if (!userText) return; if (activeReply) { userText = `In reply to "${activeReply.text}", my question is: ${userText}`; } appendMessage('user', userText, capturedImageData); const thinkingDiv = document.createElement('div'); thinkingDiv.className = 'gemini-message model-message thinking'; thinkingDiv.innerText = 'Thinking...'; chatLog.appendChild(thinkingDiv); chatLog.scrollTop = chatLog.scrollHeight; chatInput.value = ''; activeReply = null; replyContextBar.classList.add('gemini-hidden'); chrome.runtime.sendMessage({ type: 'geminiFollowUp', history: conversationHistory, imageData: capturedImageData }, (response) => { thinkingDiv.remove(); if (chrome.runtime.lastError) { appendMessage('model', `Error: ${chrome.runtime.lastError.message}`, null, true); return; } if (response && response.success) { conversationHistory.push({ role: 'model', parts: [{ text: response.response }] }); appendMessage('model', response.response, null, true); } else { appendMessage('model', `Error: ${response ? response.error : 'No response.'}`, null, true); if (response && response.isModelProblem) { modelForm.classList.remove('gemini-hidden'); modelDisplay.classList.add('active'); } } }); capturedImageData = null; };
    modelForm.onsubmit = (e) => { e.preventDefault(); const newModel = modelSelect.value; chrome.runtime.sendMessage({ type: 'saveModelAndRetry', newModel, history: conversationHistory }); popupContainer.remove(); };
    conversationHistory.forEach(message => appendMessage(message.role, message.parts[0].text, null, true));
    if (isModelProblem) { modelForm.classList.remove('gemini-hidden'); modelDisplay.classList.add('active'); }
    const localSettingsDefaults = { opacity: 1, width: '600px', height: '75vh', top: null, left: null, bubblePosition: null };
    chrome.storage.local.get(localSettingsDefaults, (settings) => { popupContainer.style.opacity = settings.opacity; opacitySlider.value = settings.opacity; contentDiv.style.width = settings.width; contentDiv.style.height = settings.height; if (settings.top && settings.left) { contentDiv.style.transform = 'none'; contentDiv.style.top = settings.top; contentDiv.style.left = settings.left; } if (settings.bubblePosition && settings.bubblePosition.top && settings.bubblePosition.left) { minimizedBubble.style.top = settings.bubblePosition.top; minimizedBubble.style.left = settings.bubblePosition.left; minimizedBubble.style.bottom = 'auto'; minimizedBubble.style.right = 'auto'; } });
    chrome.storage.local.get({ availableModels: [] }, (localData) => { const models = localData.availableModels.length > 0 ? localData.availableModels : [{ id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash (Fallback)" }, ]; modelSelect.innerHTML = ''; models.forEach(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = model.name; modelSelect.appendChild(option); }); chrome.storage.sync.get({ stealthModeEnabled: false, selectedModel: 'gemini-1.5-flash-latest' }, (syncSettings) => { stealthModeEnabled = syncSettings.stealthModeEnabled; const currentModel = models.find(m => m.id === syncSettings.selectedModel); modelDisplayText.textContent = currentModel ? currentModel.name : 'Unknown Model'; modelSelect.value = syncSettings.selectedModel; }); });
    opacitySlider.addEventListener('input', (e) => { popupContainer.style.opacity = e.target.value; chrome.storage.local.set({ opacity: e.target.value }); });
    resizeObserver.observe(contentDiv);
    let isWindowDragging = false; let windowOffsetX, windowOffsetY; toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('.gemini-toolbar-btn') || e.target.closest('#gemini-model-display-container') || e.target.closest('.opacity-control')) return; isWindowDragging = true; windowOffsetX = e.clientX - contentDiv.offsetLeft; windowOffsetY = e.clientY - contentDiv.offsetTop; contentDiv.style.transform = 'none'; document.addEventListener('mousemove', onWindowDrag); document.addEventListener('mouseup', onStopWindowDrag); });
    function onWindowDrag(e) { if (!isWindowDragging) return; e.preventDefault(); contentDiv.style.left = `${e.clientX - windowOffsetX}px`; contentDiv.style.top = `${e.clientY - windowOffsetY}px`; }
    
    function onStopWindowDrag() {
        isWindowDragging = false;
        document.removeEventListener('mousemove', onWindowDrag);
        document.removeEventListener('mouseup', onStopWindowDrag);
        // **** THIS IS THE FIX (2/3) ****
        if (chrome.runtime?.id) {
            chrome.storage.local.set({
                top: contentDiv.style.top,
                left: contentDiv.style.left
            });
        }
    }

    let isBubbleDragging = false;
    minimizedBubble.addEventListener('mousedown', (e) => {
        isBubbleDragging = true;
        didDragBubble = false;
        const offsetX = e.clientX - minimizedBubble.getBoundingClientRect().left;
        const offsetY = e.clientY - minimizedBubble.getBoundingClientRect().top;
        const rect = minimizedBubble.getBoundingClientRect();
        minimizedBubble.style.left = `${rect.left}px`;
        minimizedBubble.style.top = `${rect.top}px`;
        minimizedBubble.style.right = 'auto';
        minimizedBubble.style.bottom = 'auto';
        function onBubbleDrag(e) { if (!isBubbleDragging) return; didDragBubble = true; e.preventDefault(); e.stopPropagation(); let newLeft = e.clientX - offsetX; let newTop = e.clientY - offsetY; const viewportWidth = window.innerWidth; const viewportHeight = window.innerHeight; const bubbleWidth = minimizedBubble.offsetWidth; const bubbleHeight = minimizedBubble.offsetHeight; newLeft = Math.max(0, Math.min(newLeft, viewportWidth - bubbleWidth)); newTop = Math.max(0, Math.min(newTop, viewportHeight - bubbleHeight)); minimizedBubble.style.left = `${newLeft}px`; minimizedBubble.style.top = `${newTop}px`; }
        function onStopBubbleDrag() {
            if (!isBubbleDragging) return;
            isBubbleDragging = false;
            document.removeEventListener('mousemove', onBubbleDrag);
            document.removeEventListener('mouseup', onStopBubbleDrag);
            if (didDragBubble) {
                // **** THIS IS THE FIX (3/3) ****
                if (chrome.runtime?.id) {
                    const newPosition = {
                        top: minimizedBubble.style.top,
                        left: minimizedBubble.style.left
                    };
                    chrome.storage.local.set({ bubblePosition: newPosition });
                }
            }
        }
        document.addEventListener('mousemove', onBubbleDrag);
        document.addEventListener('mouseup', onStopBubbleDrag);
    });
    
    chatInput.focus();

}, { once: true });