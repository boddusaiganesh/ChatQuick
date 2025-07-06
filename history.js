document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('history-container');
  
  // Load and display history
  chrome.storage.local.get({ queryHistory: [] }, (data) => {
    container.innerHTML = ''; // Clear "Loading..." message
    const history = data.queryHistory;

    if (history.length === 0) {
      container.innerHTML = '<p>No history yet. Ask Gemini about something to see it here!</p>';
      return;
    }

    history.forEach(item => {
      const entryDiv = document.createElement('div');
      entryDiv.className = 'history-item';
      
      const promptH3 = document.createElement('h3');
      promptH3.textContent = item.prompt;

      const responseP = document.createElement('p');
      responseP.textContent = item.response;
      
      const timeSmall = document.createElement('small');
      timeSmall.textContent = new Date(item.timestamp).toLocaleString();

      entryDiv.appendChild(promptH3);
      entryDiv.appendChild(responseP);
      entryDiv.appendChild(timeSmall);

      container.appendChild(entryDiv);
    });
  });

  // Handle clear history button
  document.getElementById('clear-history').addEventListener('click', () => {
    if (confirm('Are you sure you want to delete all query history? This cannot be undone.')) {
      chrome.storage.local.set({ queryHistory: [] }, () => {
        // Reload the page to show the empty state
        window.location.reload();
      });
    }
  });
});