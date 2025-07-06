// modules/toast.js

// Function to show a temporary toast notification
export function showToastIndicator() {
  if (document.getElementById('gemini-toast-indicator')) return;
  const toast = document.createElement('div');
  toast.id = 'gemini-toast-indicator';
  toast.innerText = 'Asking Gemini...';
  document.body.appendChild(toast);
  setTimeout(() => { toast.classList.add('visible'); }, 10);
}

// Function to remove the toast notification
export function removeToastIndicator() {
  const toast = document.getElementById('gemini-toast-indicator');
  if (toast) {
    toast.classList.remove('visible');
    setTimeout(() => { toast.remove(); }, 300);
  }
}