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
  await chrome.storage.local.remove('unimemory_projects_cache');
}

// ============ API Calls ============

/**
 * Fetch with timeout to prevent indefinite waiting
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds (default 30s)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - server is taking too long to respond. Try saving a smaller chat or try again later.');
    }
    throw error;
  }
}

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

async function searchNuclearMemories(query, limit = 20) {
  let session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  if (!query || !query.trim()) {
    return [];
  }

  console.log('[UniMemory] Searching memories for query:', query);

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

  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Not authenticated');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[UniMemory] Memory search failed:', error);
    throw new Error(error.detail || 'Failed to search memories');
  }

  const result = await response.json();
  const memories = result.results || [];
  console.log('[UniMemory] Retrieved', memories.length, 'memories');
  return memories;
}

async function searchSources(query = '', limit = 50) {
  let session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  // Build URL with query parameter if provided
  let url = `${API_BASE_URL}/consumer/session/sources?limit=${limit}`;
  if (query && query.trim()) {
    url += `&query=${encodeURIComponent(query.trim())}`;
    console.log('[UniMemory] Searching sources for:', query);
  } else {
    console.log('[UniMemory] Fetching recent sources (limit', limit + ')');
  }

  // Use consumer session token variant for extension
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${session.token}`
    }
  });

  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Not authenticated');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[UniMemory] Failed to fetch sources:', error);
    throw new Error(error.detail || 'Failed to fetch sources');
  }

  const sources = await response.json();
  console.log('[UniMemory] Fetched', sources.length, 'sources');
  return sources;
}

async function getSource(sourceId) {
  let session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  console.log('[UniMemory] Fetching source details for', sourceId);

  // Use consumer session token variant for extension
  const response = await fetch(`${API_BASE_URL}/consumer/session/sources/${sourceId}`, {
    headers: {
      'Authorization': `Bearer ${session.token}`
    }
  });

  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Not authenticated');
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const error = await response.json();
      errorDetail = error.detail || JSON.stringify(error);
    } catch (e) {
      // ignore parse error
    }
    console.error('[UniMemory] Failed to fetch source details:', errorDetail);
    throw new Error('Failed to fetch source');
  }

  const source = await response.json();
  console.log('[UniMemory] Fetched source details for', sourceId);
  return source;
}

async function ingestPrompt(prompt, platform) {
  let session = await getSession();

  if (!session) {
    console.log('[UniMemory] Not authenticated, skipping prompt ingestion');
    return { success: false, reason: 'not_authenticated' };
  }

  console.log('[UniMemory] Ingesting prompt via ingest API:', prompt.substring(0, 50) + '...');

  try {
    const response = await fetch(`${API_BASE_URL}/ingest/text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // Raw prompt content to be evaluated by ingest pipeline
        content: prompt,
        // Tag as coming from extension + specific AI platform
        user_id: 'anonymous',
        app_id: platform,
        // For prompts sent to AI, we only want atomic memories, no Source
        create_source: false
      })
    });

    if (response.status === 401) {
      await clearSession();
      console.error('[UniMemory] Session expired during ingest');
      return { success: false, reason: 'session_expired' };
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[UniMemory] Ingest failed:', error);
      return { success: false, reason: 'api_error', error };
    }

    const result = await response.json();
    console.log('[UniMemory] Ingest result:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('[UniMemory] Ingest network error:', error);
    return { success: false, reason: 'network_error', error: error.message };
  }
}

async function ingestChat(chatData) {
  let session = await getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  console.log('[UniMemory] Ingesting chat with', chatData.messages.length, 'messages', 'to project:', chatData.projectId || 'default');

  const response = await fetchWithTimeout(`${API_BASE_URL}/ingest/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: chatData.messages,
      project_id: chatData.projectId || null,  // Project to save to
      source_metadata: {
        platform: chatData.platform,
        conversation_id: chatData.conversationId,
        url: chatData.url,
        // Don't send title - backend will generate meaningful title from content
        captured_at: new Date().toISOString()
      }
    })
  }, 30000);  // 30 second timeout

  // If 401 Unauthorized, session might be expired - prompt re-login
  if (response.status === 401) {
    await clearSession();
    console.error('[UniMemory] Session expired, please log in again');
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('[UniMemory] Ingest failed:', response.status, error);

    // Provide better error messages for common failures
    let errorMessage = 'Failed to save chat';
    if (response.status === 502 || response.status === 504) {
      errorMessage = 'Server is overloaded or timed out. Try saving a smaller chat or wait a moment and try again.';
    } else if (response.status === 503) {
      errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
    } else if (error.detail) {
      errorMessage = error.detail;
    }

    throw new Error(errorMessage);
  }

  const result = await response.json();
  console.log('[UniMemory] Ingest response:', result);
  console.log('[UniMemory] Stored:', result.stored, 'memories, Skipped:', result.skipped, 'Source ID:', result.source_id);

  return result;
}

// ============ Project Caching ============

/**
 * Fetch projects from API and cache them locally.
 * Called on tab switch, page load, and when popup requests projects.
 */
async function fetchAndCacheProjects(session) {
  if (!session) {
    session = await getSession();
    if (!session) return [];
  }

  console.log('[UniMemory] Fetching fresh projects...');

  // Ensure default project exists
  const ensureResponse = await fetch(`${API_BASE_URL}/consumer/session/projects/default/ensure`, {
    headers: { 'Authorization': `Bearer ${session.token}` }
  });

  if (ensureResponse.status === 401) {
    await clearSession();
    throw new Error('Session expired');
  }

  // Fetch all projects
  const response = await fetch(`${API_BASE_URL}/consumer/session/projects`, {
    headers: { 'Authorization': `Bearer ${session.token}` }
  });

  if (response.status === 401) {
    await clearSession();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }

  const projects = await response.json();
  console.log('[UniMemory] Fetched and cached', projects.length, 'projects');

  // Cache with timestamp
  await chrome.storage.local.set({
    unimemory_projects_cache: {
      projects,
      timestamp: Date.now()
    }
  });

  return projects;
}

// Preload projects when user switches tabs (so popup opens instantly)
chrome.tabs.onActivated.addListener(async () => {
  try {
    const session = await getSession();
    if (session) {
      // Only refresh if cache is older than 30s
      const cached = await chrome.storage.local.get('unimemory_projects_cache');
      const cache = cached.unimemory_projects_cache;
      if (!cache || (Date.now() - cache.timestamp > 30 * 1000)) {
        await fetchAndCacheProjects(session);
      }
    }
  } catch (e) {
    // Silent fail - just a preload
  }
});

// Also preload on navigation complete (new page loaded / refresh)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only for main frame (not iframes)
  if (details.frameId !== 0) return;
  try {
    const session = await getSession();
    if (session) {
      const cached = await chrome.storage.local.get('unimemory_projects_cache');
      const cache = cached.unimemory_projects_cache;
      if (!cache || (Date.now() - cache.timestamp > 30 * 1000)) {
        await fetchAndCacheProjects(session);
      }
    }
  } catch (e) {
    // Silent fail
  }
});

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
          // Preload projects immediately after login
          fetchAndCacheProjects().catch(() => {});
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

        case 'SEARCH_NUCLEAR_MEMORIES': {
          const result = await searchNuclearMemories(message.query, message.limit || 20);
          sendResponse({ success: true, memories: result });
          break;
        }
        case 'SEARCH_SOURCES': {
          const result = await searchSources(message.query || '', message.limit || 50);
          sendResponse({ success: true, sources: result });
          break;
        }
        case 'GET_SOURCE': {
          const result = await getSource(message.sourceId);
          sendResponse({ success: true, source: result });
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

        case 'GET_PROJECTS': {
          const session = await getSession();
          if (!session) {
            console.log('[UniMemory] GET_PROJECTS: Not authenticated');
            sendResponse({ success: false, error: 'Not authenticated', projects: [], needsLogin: true });
            break;
          }

          try {
            // Return cached projects instantly if available
            const cached = await chrome.storage.local.get('unimemory_projects_cache');
            const cache = cached.unimemory_projects_cache;
            const CACHE_TTL = 60 * 1000; // 1 minute

            if (cache && cache.projects && (Date.now() - cache.timestamp < CACHE_TTL)) {
              console.log('[UniMemory] Returning cached projects:', cache.projects.length);
              sendResponse({ success: true, projects: cache.projects, fromCache: true });
              // Refresh in background (fire and forget)
              fetchAndCacheProjects(session).catch(() => {});
              break;
            }

            // No cache or expired - fetch fresh
            const projects = await fetchAndCacheProjects(session);
            sendResponse({ success: true, projects });
          } catch (error) {
            console.error('[UniMemory] Failed to fetch projects:', error);
            // Try returning stale cache on error
            const cached = await chrome.storage.local.get('unimemory_projects_cache');
            const stale = cached.unimemory_projects_cache;
            if (stale && stale.projects) {
              sendResponse({ success: true, projects: stale.projects, fromCache: true });
            } else {
              sendResponse({ success: false, error: error.message, projects: [] });
            }
          }
          break;
        }

        case 'CREATE_PROJECT': {
          const session = await getSession();
          if (!session) {
            sendResponse({ success: false, error: 'Not authenticated' });
            break;
          }

          try {
            const response = await fetch(`${API_BASE_URL}/consumer/projects`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: message.name })
            });

            if (!response.ok) {
              throw new Error('Failed to create project');
            }

            const project = await response.json();
            // Invalidate cache so next load picks up the new project
            await chrome.storage.local.remove('unimemory_projects_cache');
            sendResponse({ success: true, project });
          } catch (error) {
            console.error('[UniMemory] Failed to create project:', error);
            sendResponse({ success: false, error: error.message });
          }
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

// ============ Extension Icon Click Handler ============

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Send message to content script to show the extension popup
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_EXTENSION_POPUP' });
  } catch (error) {
    console.error('Failed to show extension popup:', error);
    // If content script not ready, inject it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/universal.js']
      });
      // Try again after injection
      setTimeout(async () => {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_EXTENSION_POPUP' });
      }, 100);
    } catch (injectError) {
      console.error('Failed to inject content script:', injectError);
    }
  }
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
