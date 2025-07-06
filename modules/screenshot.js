// modules/screenshot.js

let activeTabIdForCrop = null;

function handleCaptureRequest(tab) {
  chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['select-area.js'] });
}

async function handleCaptureComplete(area, tab, devicePixelRatio) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg' });
    activeTabIdForCrop = tab.id;
    await setupOffscreenDocument(dataUrl, area, devicePixelRatio);
  } catch (error) {
    console.error("Capture failed:", error);
    activeTabIdForCrop = null;
    await closeOffscreenDocument();
  }
}

async function handleCropComplete(imageData) {
    if (activeTabIdForCrop) {
        chrome.scripting.executeScript({
            target: { tabId: activeTabIdForCrop },
            func: (imgData) => { document.dispatchEvent(new CustomEvent('geminiImageCaptured', { detail: { imageData: imgData } })) },
            args: [imageData]
        });
    }
    await closeOffscreenDocument();
    activeTabIdForCrop = null;
}

async function closeOffscreenDocument() {
  if (await chrome.offscreen.hasDocument?.()) {
    await chrome.offscreen.closeDocument();
  }
}

async function setupOffscreenDocument(dataUrl, area, devicePixelRatio) {
  await closeOffscreenDocument();
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'To crop the screenshot image on a canvas.',
  });
  chrome.runtime.sendMessage({ type: 'crop-image', target: 'offscreen', dataUrl, area, devicePixelRatio });
}

export {
  handleCaptureRequest,
  handleCaptureComplete,
  handleCropComplete,
};