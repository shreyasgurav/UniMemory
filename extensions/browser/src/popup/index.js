/**
 * UniMemory - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');
  const notAuthEl = document.getElementById('not-authenticated');
  const authEl = document.getElementById('authenticated');
  
  // Elements
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');
  const autoSaveToggle = document.getElementById('auto-save-toggle');
  const platformChatgpt = document.getElementById('platform-chatgpt');
  const platformClaude = document.getElementById('platform-claude');
  const platformGemini = document.getElementById('platform-gemini');
  
  // Check auth status
  async function checkAuth() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      
      loadingEl.classList.add('hidden');
      
      if (response.authenticated && response.user) {
        showAuthenticatedState(response.user);
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
    
    // Set user info
    userName.textContent = user.display_name || user.email?.split('@')[0] || 'User';
    userEmail.textContent = user.email || '';
    
    if (user.avatar_url) {
      userAvatar.innerHTML = `<img src="${user.avatar_url}" alt="Avatar">`;
    } else {
      userAvatar.textContent = (user.display_name || user.email || 'U').charAt(0).toUpperCase();
    }
    
    // Load settings
    loadSettings();
  }
  
  function showNotAuthenticatedState() {
    notAuthEl.classList.remove('hidden');
    authEl.classList.add('hidden');
  }
  
  async function loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = response.settings;
      
      autoSaveToggle.checked = settings.autoSave || false;
      platformChatgpt.checked = settings.platforms?.chatgpt !== false;
      platformClaude.checked = settings.platforms?.claude !== false;
      platformGemini.checked = settings.platforms?.gemini !== false;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }
  
  async function saveSettings() {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: {
          autoSave: autoSaveToggle.checked,
          platforms: {
            chatgpt: platformChatgpt.checked,
            claude: platformClaude.checked,
            gemini: platformGemini.checked
          }
        }
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }
  
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
  platformChatgpt.addEventListener('change', saveSettings);
  platformClaude.addEventListener('change', saveSettings);
  platformGemini.addEventListener('change', saveSettings);
  
  // Initialize
  checkAuth();
});
