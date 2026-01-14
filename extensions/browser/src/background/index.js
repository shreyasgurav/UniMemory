/**
 * UniMemory Chrome Extension - Background Service Worker
 * Handles authentication, API calls, and message passing
 */

const API_BASE_URL = 'https://unimemory.up.railway.app/api/v1';
const APP_URL = 'https://unimemory-app.vercel.app';

// ============ Auth State ============

async function getSession() {
  const result = await chrome.storage.local.get('unimemory_session');
  const session = result.unimemory_session;
  
  if (!session) return null;
  
  // Check if expired
  if (session.expiresAt && Date.now() > session.expiresAt) {
    await chrome.storage.local.remove('unimemory_session');
    return null;
  }
  
  return session;
}

async function setSession(sessionData) {
  await chrome.storage.local.set({
    unimemory_session: {
      token: sessionData.session_token,
      user: sessionData.user,
      expiresAt: Date.now() + (sessionData.expires_in * 1000)
    }
  });
}

async function clearSession() {
  await chrome.storage.local.remove('unimemory_session');
}

// ============ API Calls ============

async function refreshSession(firebaseToken) {
  try {
    const response = await fetch(`${API_BASE_URL}/consumer/auth/session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${firebaseToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get session');
    }
    
    const data = await response.json();
    await setSession(data);
    return data;
  } catch (error) {
    console.error('Failed to refresh session:', error);
    throw error;
  }
}

async function ingestChat(chatData) {
  const session = await getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE_URL}/ingest/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: chatData.messages,
      source_metadata: {
        platform: chatData.platform,
        conversation_id: chatData.conversationId,
        url: chatData.url,
        title: chatData.title,
        captured_at: new Date().toISOString()
      }
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to save chat');
  }
  
  return await response.json();
}

// ============ Message Handlers ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  (async () => {
    try {
      switch (message.type) {
        case 'GET_AUTH_STATUS': {
          const session = await getSession();
          sendResponse({
            success: true,
            authenticated: !!session,
            user: session?.user || null
          });
          break;
        }
        
        case 'LOGIN': {
          // Open UniMemory login page
          chrome.tabs.create({ url: `${APP_URL}/login?extension=true` });
          sendResponse({ success: true });
          break;
        }
        
        case 'LOGOUT': {
          await clearSession();
          sendResponse({ success: true });
          break;
        }
        
        case 'SET_SESSION': {
          // Called from app.unimemory.app after login
          await setSession(message.data);
          sendResponse({ success: true });
          break;
        }
        
        case 'REFRESH_SESSION': {
          // Refresh with Firebase token
          const result = await refreshSession(message.firebaseToken);
          sendResponse({ success: true, data: result });
          break;
        }
        
        case 'SAVE_CHAT': {
          const result = await ingestChat(message.data);
          sendResponse({ success: true, data: result });
          break;
        }
        
        case 'GET_SETTINGS': {
          const settings = await chrome.storage.local.get('unimemory_settings');
          sendResponse({
            success: true,
            settings: settings.unimemory_settings || {
              autoSave: false,
              platforms: {
                chatgpt: true,
                claude: true,
                gemini: true
              }
            }
          });
          break;
        }
        
        case 'UPDATE_SETTINGS': {
          await chrome.storage.local.set({
            unimemory_settings: message.settings
          });
          sendResponse({ success: true });
          break;
        }
        
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // Return true to indicate async response
  return true;
});

// ============ Extension Install/Update ============

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      unimemory_settings: {
        autoSave: false,
        platforms: {
          chatgpt: true,
          claude: true,
          gemini: true
        }
      }
    });
    
    // Open welcome page
    chrome.tabs.create({ url: `${APP_URL}/extension/welcome` });
  }
});

console.log('UniMemory background service worker loaded');
