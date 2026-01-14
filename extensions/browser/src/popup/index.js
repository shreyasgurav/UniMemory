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
  
  // Check auth status
  async function checkAuth() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      
      loadingEl.classList.add('hidden');
      
      if (response.authenticated && response.user) {
        currentUser = response.user;
        showAuthenticatedState(response.user);
        await loadCurrentPageInfo();
      } else {
        showNotAuthenticatedState();
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
    saveCurrentPageBtn.disabled = true;
    saveCurrentPageBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/></svg> Saving...';
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('No active tab found', 'error');
        return;
      }
      
      // Send message to content script to save the page
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'SAVE_CURRENT_PAGE' });
      
      if (response && response.success) {
        showStatus('Page saved successfully!', 'success');
      } else {
        showStatus('Failed to save page', 'error');
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      showStatus('Failed to save page', 'error');
    } finally {
      saveCurrentPageBtn.disabled = false;
      saveCurrentPageBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg> Save Current Page';
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
  
  // Settings change handlers
  autoSaveToggle.addEventListener('change', saveSettings);
  
  // Initialize
  checkAuth();
});
