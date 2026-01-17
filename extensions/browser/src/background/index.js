/**
 * UniMemory Chrome Extension - Background Service Worker
 * Handles authentication, API calls, and message passing
 */

const API_BASE_URL = 'https://unimemory.up.railway.app/api/v1';
const APP_URL = 'https://unimemory-app.vercel.app';

// ============ Context Menu Setup ============

// Create context menu on extension install/startup
chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

// Recreate context menu on startup
chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

function createContextMenu() {
  // Remove existing menu items first
  chrome.contextMenus.removeAll(() => {
    // Detect OS for keyboard shortcut display
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const shortcutKey = isMac ? '⌘' : 'Ctrl';
    
    // Create context menu item for editable fields
    chrome.contextMenus.create({
      id: 'unimemory-add-memories',
      title: `Add memories from UniMemory (${shortcutKey} \\)`,
      contexts: ['editable'],
      documentUrlPatterns: [
        'https://chat.openai.com/*',
        'https://chatgpt.com/*',
        'https://claude.ai/*',
        'https://gemini.google.com/*',
        'https://bard.google.com/*'
      ]
    });
    
    console.log('[UniMemory] Context menu created');
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'unimemory-add-memories') {
    // Send message to content script to trigger memory search
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_CLICKED'
    }).catch(err => {
      console.error('[UniMemory] Failed to send message to content script:', err);
    });
  }
});

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

async function searchMemories(query, limit = 5) {
  let session = await getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  console.log('[UniMemory] Searching memories for:', query.substring(0, 50) + '...');
  
  const response = await fetch(`${API_BASE_URL}/consumer/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: query,
      limit: limit
    })
  });
  
  // If 401 Unauthorized, session might be expired
  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Not authenticated');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[UniMemory] Search failed:', error);
    throw new Error(error.detail || 'Failed to search memories');
  }
  
  const result = await response.json();
  console.log('[UniMemory] Search returned', result.results?.length || 0, 'memories');
  
  return result;
}

async function ingestPrompt(prompt, platform) {
  let session = await getSession();
  
  if (!session) {
    console.log('[UniMemory] Not authenticated, skipping prompt ingestion');
    return { success: false, reason: 'not_authenticated' };
  }
  
  console.log('[UniMemory] Creating memory from', platform, ':', prompt.substring(0, 50) + '...');
  
  // Create memory via unified POST /memories endpoint
  // Supports both API key (B2B) and session token (consumer) auth
  const memoryData = {
    content: prompt,
    user_id: 'consumer',  // Identifies as consumer extension user
    app_id: platform,     // Platform where prompt was captured
    tags: []
  };
  
  try {
    const response = await fetch(`${API_BASE_URL}/memories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(memoryData)
    });
    
    // If 401 Unauthorized, session might be expired
    if (response.status === 401) {
      await clearSession();
      console.error('[UniMemory] Session expired during memory creation');
      return { success: false, reason: 'session_expired' };
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[UniMemory] Memory creation failed:', error);
      return { success: false, reason: 'api_error', error };
    }
    
    const result = await response.json();
    console.log('[UniMemory] Memory created:', result.id);
    
    return { success: true, data: result };
  } catch (error) {
    console.error('[UniMemory] Memory creation error:', error);
    return { success: false, reason: 'network_error', error: error.message };
  }
}

async function ingestChat(chatData) {
  let session = await getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  console.log('[UniMemory] Ingesting chat with', chatData.messages.length, 'messages');
  
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
        // Don't send title - backend will generate meaningful title from content
        captured_at: new Date().toISOString()
      }
    })
  });
  
  // If 401 Unauthorized, session might be expired - prompt re-login
  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Session expired. Please log in again.');
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[UniMemory] Ingest failed:', error);
    throw new Error(error.detail || 'Failed to save chat');
  }
  
  const result = await response.json();
  console.log('[UniMemory] Ingest response:', result);
  console.log('[UniMemory] Stored:', result.stored, 'memories, Skipped:', result.skipped, 'Source ID:', result.source_id);
  
  return result;
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
          // Open UniMemory extension welcome page (handles login + auth handshake)
          chrome.tabs.create({ url: `${APP_URL}/extension/welcome` });
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
        
        case 'SEARCH_MEMORIES': {
          const result = await searchMemories(message.query, message.limit || 5);
          sendResponse({ success: true, data: result });
          break;
        }
        
        case 'INGEST_PROMPT': {
          const result = await ingestPrompt(message.data.prompt, message.data.platform);
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
