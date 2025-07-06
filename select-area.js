// select-area.js - Injected script for selecting a region of the page.

(() => {
  if (document.getElementById('gemini-capture-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'gemini-capture-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '2147483647';
  overlay.style.cursor = 'crosshair';
  document.body.appendChild(overlay);

  const selectionBox = document.createElement('div');
  selectionBox.id = 'gemini-selection-box';
  selectionBox.style.position = 'absolute';
  selectionBox.style.border = '2px dashed #fff';
  selectionBox.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
  selectionBox.style.pointerEvents = 'none';
  overlay.appendChild(selectionBox);

  let startX, startY;
  let isDrawing = false;

  const cleanup = () => {
    overlay.remove();
    // The event listeners are on the overlay, so they are removed with it.
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  };

  const onMouseMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const currentX = e.clientX;
    const currentY = e.clientY;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const newX = Math.min(currentX, startX);
    const newY = Math.min(currentY, startY);
    selectionBox.style.left = `${newX}px`;
    selectionBox.style.top = `${newY}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  };

  const onMouseUp = (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    e.preventDefault();
    const rect = {
      x: parseInt(selectionBox.style.left, 10),
      y: parseInt(selectionBox.style.top, 10),
      width: parseInt(selectionBox.style.width, 10),
      height: parseInt(selectionBox.style.height, 10)
    };

    if (rect.width < 10 || rect.height < 10) {
      cleanup();
      return;
    }

    // --- THIS IS THE FIX ---
    // Send the coordinates AND the devicePixelRatio back to the background script
    chrome.runtime.sendMessage({
      type: 'captureComplete',
      area: rect,
      devicePixelRatio: window.devicePixelRatio || 1 // Get the ratio from the window object here
    });
    cleanup();
  };
  
  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);

  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') {
      cleanup();
      document.removeEventListener('keydown', onKey);
    }
  });

})();