// offscreen.js

chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message) {
  // Handler for image cropping (existing feature)
  if (message.target === 'offscreen' && message.type === 'crop-image') {
    const { dataUrl, area, devicePixelRatio } = message;
    const croppedDataUrl = await cropAndGetDataUrl(dataUrl, area, devicePixelRatio);
    chrome.runtime.sendMessage({ type: 'cropComplete', imageData: croppedDataUrl });
  }

  // NEW: Handler for sampling the background color
  if (message.target === 'offscreen' && message.type === 'sample-color') {
    const { dataUrl, x, y } = message;
    const colors = await getStealthColors(dataUrl, x, y);
    chrome.runtime.sendMessage({ type: 'stealthColorReady', ...colors });
  }
}

// Function to get the bubble's background color and a contrasting icon color
function getStealthColors(dataUrl, x, y) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      // We only need a tiny canvas to sample the pixel
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      
      // Draw the single pixel from the screenshot onto our canvas
      ctx.drawImage(image, x, y, 1, 1, 0, 0, 1, 1);
      
      // Get the RGBA data for that one pixel
      const pixelData = ctx.getImageData(0, 0, 1, 1).data;
      const [r, g, b] = pixelData;
      
      const backgroundColor = `rgb(${r}, ${g}, ${b})`;
      
      // Determine if the background is "light" or "dark" to choose a contrasting icon color
      // This is a standard formula for perceived brightness
      const brightness = Math.round(((r * 299) + (g * 587) + (b * 114)) / 1000);
      const iconColor = (brightness > 125) ? 'black' : 'white';

      resolve({ backgroundColor, iconColor });
    };
    image.src = dataUrl;
  });
}

// This function is for the existing screenshot feature
function cropAndGetDataUrl(dataUrl, area, devicePixelRatio) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = area.width * devicePixelRatio;
      canvas.height = area.height * devicePixelRatio;
      ctx.drawImage(
        image,
        area.x * devicePixelRatio, area.y * devicePixelRatio,
        area.width * devicePixelRatio, area.height * devicePixelRatio,
        0, 0, canvas.width, canvas.height
      );
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    image.src = dataUrl;
  });
}