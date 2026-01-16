/**
 * UniMemory - Popup Script (Supermemory-style)
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const notAuthEl = document.getElementById('not-authenticated');
  const authEl = document.getElementById('authenticated');
  
  // Elements
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const saveCurrentPageBtn = document.getElementById('save-current-page-btn');
  const autoSaveToggle = document.getElementById('auto-save-toggle');
  const pageTitle = document.getElementById('page-title');
  const pageUrl = document.getElementById('page-url');
  const statusMessage = document.getElementById('status-message');
  const userAvatarSettings = document.getElementById('user-avatar-settings');
  const userNameSettings = document.getElementById('user-name-settings');
  const userEmailSettings = document.getElementById('user-email-settings');
  
  // Tab elements
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Current user
  let currentUser = null;
  
  // Check auth status with retry logic
  async function checkAuth(retryCount = 0) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      
      loadingEl.classList.add('hidden');
      
      if (response.authenticated && response.user) {
        currentUser = response.user;
        showAuthenticatedState(response.user);
        await loadCurrentPageInfo();
      } else {
        // If not authenticated and this is first check, wait a bit and retry once
        // This handles the case where session is being set from welcome page
        if (retryCount === 0) {
          setTimeout(() => checkAuth(1), 500);
        } else {
          showNotAuthenticatedState();
        }
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      loadingEl.classList.add('hidden');
      showNotAuthenticatedState();
    }
  }
  
  function showAuthenticatedState(user) {
    notAuthEl.classList.add('hidden');
    authEl.classList.remove('hidden');
    
    // Set user info in settings tab
    userNameSettings.textContent = user.display_name || user.email?.split('@')[0] || 'User';
    userEmailSettings.textContent = user.email || '';
    
    if (user.avatar_url) {
      userAvatarSettings.innerHTML = `<img src="${user.avatar_url}" alt="Avatar">`;
    } else {
      userAvatarSettings.textContent = (user.display_name || user.email || 'U').charAt(0).toUpperCase();
    }
    
    // Load settings
    loadSettings();
  }
  
  function showNotAuthenticatedState() {
    notAuthEl.classList.remove('hidden');
    authEl.classList.add('hidden');
  }
  
  async function loadCurrentPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        pageTitle.textContent = tab.title || 'Current Page';
        pageUrl.textContent = tab.url || '';
      }
    } catch (error) {
      console.error('Failed to load page info:', error);
    }
  }
  
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = response.settings;
      
      autoSaveToggle.checked = settings.autoSave || false;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  async function saveSettings() {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          autoSave: autoSaveToggle.checked
        }
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
  
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    setTimeout(() => {
      statusMessage.classList.add('hidden');
    }, 3000);
  }
  
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update visible content
      tabContents.forEach(content => {
        if (content.id === `tab-${targetTab}`) {
          content.classList.remove('hidden');
          content.classList.add('active');
        } else {
          content.classList.add('hidden');
          content.classList.remove('active');
        }
      });
    });
  });
  
  // Save current page
  saveCurrentPageBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', 'error');
        return;
      }
      
      // Close popup immediately
      window.close();
      
      // Send message to content script to save the page
      // The content script will show toast notifications
      await chrome.tabs.sendMessage(tab.id, { type: 'SAVE_CURRENT_PAGE' });
    } catch (error) {
      console.error('Failed to save page:', error);
      showStatus('Failed to save page', 'error');
    }
  });
  
  // Event listeners
  loginBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'LOGIN' });
    window.close();
  });
  
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    showNotAuthenticatedState();
  });
  
  // Import ChatGPT memories
  const importChatGPTBtn = document.getElementById('import-chatgpt-btn');
  if (importChatGPTBtn) {
    importChatGPTBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://chatgpt.com/#settings/Personalization' });
      window.close();
    });
  }
  
  // Settings change handlers
  autoSaveToggle.addEventListener('change', saveSettings);
  
  // Initialize
  checkAuth();
});
