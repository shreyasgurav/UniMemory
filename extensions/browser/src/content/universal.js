/**
 * UniMemory - Universal AI Chat Detector
 * Works on ANY AI chat platform by detecting conversation patterns
 */

(function() {
  'use strict';
  
  let isInitialized = false;
  
  // ============ Universal Chat Detection ============
  
  const AI_CHAT_INDICATORS = {
    // URL patterns
    urlPatterns: [
      /chat\.openai\.com/,
      /chatgpt\.com/,
      /claude\.ai/,
      /gemini\.google\.com/,
      /bard\.google\.com/,
      /poe\.com/,
      /perplexity\.ai/,
      /you\.com/,
      /character\.ai/,
      /huggingface\.co\/chat/,
      /chat\./,
      /ai\./
    ],
    
    // DOM indicators
    domIndicators: [
      '[role="presentation"]',
      '[data-message-author-role]',
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
      '[data-testid*="chat"]',
      '.message',
      '.chat-message',
      '.conversation',
      '[class*="message"]',
      '[class*="chat"]',
      '[class*="conversation"]'
    ]
  };
  
  function isAIChatPage() {
    // Check URL
    const url = window.location.href;
    const urlMatch = AI_CHAT_INDICATORS.urlPatterns.some(pattern => pattern.test(url));
    
    if (urlMatch) return true;
    
    // Check DOM for chat-like structures
    const domMatch = AI_CHAT_INDICATORS.domIndicators.some(selector => {
      return document.querySelector(selector) !== null;
    });
    
    return domMatch;
  }
  
  // ============ Raw Page Content Extraction ============
  
  function extractMessages() {
    // Extract entire page content as single raw text
    const rawContent = extractRawPageContent();
    
    // Return as single message with raw content
    return [{
      role: 'user',
      content: rawContent
    }];
  }
  
  function extractRawPageContent() {
    // Find main content container
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.content',
      '.chat-content',
      '#content',
      'article'
    ];
    
    let container = null;
    for (const selector of contentSelectors) {
      container = document.querySelector(selector);
      if (container) break;
    }
    
    if (!container) container = document.body;
    
    // Clone and clean
    const clone = container.cloneNode(true);
    
    // Remove non-content elements
    clone.querySelectorAll('script, style, nav, header, footer, button, svg, iframe, .sidebar, .navigation, [role="navigation"]').forEach(el => el.remove());
    
    // Get all text content
    let text = clone.innerText || clone.textContent || '';
    
    // Clean up whitespace
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 newlines
    text = text.replace(/[ \t]+/g, ' '); // Single spaces
    text = text.trim();
    
    return text;
  }
  
  function extractTextContent(element) {
    // Remove script, style, and other non-content elements
    const clone = element.cloneNode(true);
    clone.querySelectorAll('script, style, button, svg').forEach(el => el.remove());
    
    // Get text content
    let text = clone.innerText || clone.textContent || '';
    text = text.trim();
    
    // Clean up excessive whitespace
    text = text.replace(/\s+/g, ' ');
    
    return text;
  }
  
  function determineRole(element, index) {
    // Check data attributes
    const roleAttr = element.getAttribute('data-message-author-role') ||
                     element.getAttribute('data-role') ||
                     element.getAttribute('role');
    
    if (roleAttr) {
      if (roleAttr.includes('user') || roleAttr.includes('human')) return 'user';
      if (roleAttr.includes('assistant') || roleAttr.includes('ai') || roleAttr.includes('bot')) return 'assistant';
    }
    
    // Check class names
    const className = element.className.toString().toLowerCase();
    if (className.includes('user') || className.includes('human')) return 'user';
    if (className.includes('assistant') || className.includes('ai') || className.includes('bot')) return 'assistant';
    
    // Check testid
    const testId = element.getAttribute('data-testid') || '';
    if (testId.includes('user') || testId.includes('human')) return 'user';
    if (testId.includes('assistant') || testId.includes('ai')) return 'assistant';
    
    // Fallback: alternate based on position
    return index % 2 === 0 ? 'user' : 'assistant';
  }
  
  function extractTextBlocks() {
    const blocks = [];
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.content',
      '.chat-content',
      '#content'
    ];
    
    let container = null;
    for (const selector of contentSelectors) {
      container = document.querySelector(selector);
      if (container) break;
    }
    
    if (!container) container = document.body;
    
    // Find all text-heavy elements
    const textElements = container.querySelectorAll('p, div[class*="text"], div[class*="message"]');
    
    textElements.forEach(el => {
      const text = extractTextContent(el);
      if (text && text.length > 20) {
        blocks.push(text);
      }
    });
    
    return blocks;
  }
  
  function getPageMetadata() {
    const hostname = window.location.hostname;
    const favicon = getFaviconUrl();
    const domain = getDomainName(hostname);
    
    return {
      url: window.location.href,
      // Don't send title - backend will generate meaningful title from content
      platform: detectPlatform(),
      favicon: favicon,
      domain: domain,
      hostname: hostname,
      timestamp: new Date().toISOString()
    };
  }
  
  function getFaviconUrl() {
    // Try to find favicon from link tags
    const iconLink = document.querySelector('link[rel="icon"]') || 
                     document.querySelector('link[rel="shortcut icon"]') ||
                     document.querySelector('link[rel="apple-touch-icon"]');
    
    if (iconLink && iconLink.href) {
      return iconLink.href;
    }
    
    // Fallback to default favicon location
    const origin = window.location.origin;
    return `${origin}/favicon.ico`;
  }
  
  function getDomainName(hostname) {
    // Extract readable domain name (e.g., github.com -> GitHub)
    const parts = hostname.split('.');
    const domain = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    
    // Capitalize first letter
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }
  
  function detectPlatform() {
    const url = window.location.hostname;
    
    // Known AI platforms
    if (url.includes('openai.com') || url.includes('chatgpt.com')) return 'ChatGPT';
    if (url.includes('claude.ai')) return 'Claude';
    if (url.includes('gemini.google.com') || url.includes('bard.google.com')) return 'Gemini';
    if (url.includes('poe.com')) return 'Poe';
    if (url.includes('perplexity.ai')) return 'Perplexity';
    if (url.includes('you.com')) return 'You.com';
    if (url.includes('character.ai')) return 'Character.AI';
    if (url.includes('huggingface.co')) return 'HuggingFace';
    
    // Other known platforms
    if (url.includes('github.com')) return 'GitHub';
    if (url.includes('stackoverflow.com')) return 'Stack Overflow';
    if (url.includes('reddit.com')) return 'Reddit';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
    if (url.includes('linkedin.com')) return 'LinkedIn';
    if (url.includes('medium.com')) return 'Medium';
    if (url.includes('notion.so')) return 'Notion';
    if (url.includes('docs.google.com')) return 'Google Docs';
    
    // Use domain name as fallback
    return getDomainName(url);
  }
  
  // ============ Save Functionality ============
  
  async function saveCurrentPage() {
    // Show loading toast
    showToast('Saving memory...', 'loading');
    
    try {
      const messages = extractMessages();
      
      if (messages.length === 0) {
        showToast('No chat messages found on this page', 'error');
        return;
      }
      
      const metadata = getPageMetadata();
      
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT',
        data: {
          platform: metadata.platform,
          conversationId: null,
          url: metadata.url,
          title: metadata.title,
          messages: messages,
          metadata: metadata
        }
      });
      
      if (response.success) {
        const memoryCount = response.data?.stored || 0;
        const title = response.data?.source_title || metadata.title || 'Chat';
        showToast(`Saved "${title}" - ${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'} extracted`, 'success');
      } else {
        if (response.error === 'Not authenticated' || response.error?.includes('Session expired')) {
          showToast('Session expired. Please log in again.', 'error');
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          showToast(response.error || 'Failed to save memory', 'error');
        }
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      const errorMsg = error.message || 'Failed to save memory';
      if (errorMsg.includes('Session expired') || errorMsg.includes('Not authenticated')) {
        showToast('Session expired. Please log in again.', 'error');
        chrome.runtime.sendMessage({ type: 'LOGIN' });
      } else {
        showToast(errorMsg, 'error');
      }
    }
  }
  
  // ============ Memory Retrieval Popup ============
  
  let activeInputElement = null;
  let memoryPopup = null;
  
  function handleKeyboardShortcut(e) {
    // Cmd+] (Mac) or Ctrl+] (Windows)
    if ((e.metaKey || e.ctrlKey) && e.key === ']') {
      const activeEl = document.activeElement;
      
      // Check if focused on an input, textarea, or contenteditable
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.isContentEditable ||
        activeEl.getAttribute('contenteditable') === 'true' ||
        activeEl.closest('[contenteditable="true"]')
      );
      
      if (isInput) {
        e.preventDefault();
        activeInputElement = activeEl;
        showMemoryPopup();
      }
    }
    
    // Close popup on Escape
    if (e.key === 'Escape' && memoryPopup) {
      closeMemoryPopup();
    }
  }
  
  async function showMemoryPopup() {
    // Remove existing popup
    closeMemoryPopup();
    
    // Create popup
    memoryPopup = document.createElement('div');
    memoryPopup.className = 'unimemory-popup';
    memoryPopup.innerHTML = `
      <div class="unimemory-popup-content">
        <div class="unimemory-popup-search-container">
          <svg class="unimemory-popup-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.35-4.35"></path>
          </svg>
          <input type="text" class="unimemory-popup-search" placeholder="Search your memories..." autofocus />
        </div>
        <div class="unimemory-popup-list">
          <div class="unimemory-popup-loading">Loading...</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(memoryPopup);
    
    // Focus search input
    const searchInput = memoryPopup.querySelector('.unimemory-popup-search');
    searchInput.focus();
    
    // Load initial documents
    await loadDocuments('');
    
    // Search on input
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadDocuments(e.target.value), 300);
    });
    
    // Close on click outside
    memoryPopup.addEventListener('click', (e) => {
      if (e.target === memoryPopup) closeMemoryPopup();
    });
  }
  
  function closeMemoryPopup() {
    if (memoryPopup) {
      memoryPopup.remove();
      memoryPopup = null;
    }
  }
  
  async function loadDocuments(query) {
    const listEl = memoryPopup?.querySelector('.unimemory-popup-list');
    if (!listEl) return;
    
    // Show skeleton loading
    listEl.innerHTML = `
      ${Array(3).fill(0).map(() => `
        <div class="unimemory-popup-skeleton">
          <div class="unimemory-popup-skeleton-title"></div>
          <div class="unimemory-popup-skeleton-line"></div>
          <div class="unimemory-popup-skeleton-line"></div>
          <div class="unimemory-popup-skeleton-line"></div>
          <div class="unimemory-popup-skeleton-meta"></div>
        </div>
      `).join('')}
    `;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_SOURCES',
        query: query
      });
      
      if (!response.success) {
        const errorMsg = response.error || '';
        // If not authenticated, prompt login and show a clear message
        if (typeof errorMsg === 'string' && errorMsg.includes('Not authenticated')) {
          listEl.innerHTML = '<div class="unimemory-popup-empty">Please log in to UniMemory to use the popup.</div>';
          // Trigger login flow in background (opens extension welcome page)
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          listEl.innerHTML = '<div class="unimemory-popup-empty">Failed to load memories</div>';
        }
        return;
      }
      
      const sources = Array.isArray(response.sources)
        ? response.sources
        : [];
      
      if (sources.length === 0) {
        listEl.innerHTML = '<div class="unimemory-popup-empty">No memories found</div>';
        return;
      }
      
      listEl.innerHTML = '';
      sources.forEach(source => {
        const card = createDocumentCard(source);
        listEl.appendChild(card);
      });
      
    } catch (error) {
      console.error('Failed to load documents:', error);
      listEl.innerHTML = '<div class="unimemory-popup-empty">Failed to load memories</div>';
    }
  }
  
  function createDocumentCard(source) {
    const card = document.createElement('div');
    card.className = 'unimemory-popup-card';
    
    const title = source.title || 'Untitled';
    const summary = source.summary || 'No summary available';
    const memoryCount = source.memory_count || 0;
    const createdAt = source.created_at ? new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    
    card.innerHTML = `
      <div class="unimemory-popup-card-title">${escapeHtml(title)}</div>
      <div class="unimemory-popup-card-summary">${escapeHtml(summary.substring(0, 200))}${summary.length > 200 ? '...' : ''}</div>
      <div class="unimemory-popup-card-meta">
        ${createdAt ? `<span>${createdAt}</span>` : ''}
        ${createdAt && memoryCount > 0 ? '<span>•</span>' : ''}
        ${memoryCount > 0 ? `<span>${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'}</span>` : ''}
      </div>
    `;
    
    card.addEventListener('click', () => handleSourceClick(source, card));
    
    return card;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  async function handleSourceClick(sourceSummary, cardElement) {
    if (!activeInputElement) return;
    
    // Close popup immediately for better UX
    closeMemoryPopup();
    
    // Show loading toast
    showToast('Adding memory to chat...', 'loading');
    
    try {
      // If raw content is already present on this source, insert directly
      if (sourceSummary.raw_content && Object.keys(sourceSummary.raw_content).length > 0) {
        await insertDocumentContent(sourceSummary);
        return;
      }
      
      const response = await chrome.runtime.sendMessage({
        type: 'GET_SOURCE',
        sourceId: sourceSummary.id
      });
      
      if (!response.success) {
        const errorMsg = response.error || '';
        if (typeof errorMsg === 'string' && errorMsg.includes('Not authenticated')) {
          showToast('Session expired. Please log in again.', 'error');
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          showToast('Failed to load memory', 'error');
        }
        return;
      }
      
      const fullSource = response.source || sourceSummary;
      await insertDocumentContent(fullSource);
    } catch (error) {
      console.error('Failed to load source details:', error);
      const msg = error?.message || '';
      if (typeof msg === 'string' && msg.includes('Not authenticated')) {
        showToast('Session expired. Please log in again.', 'error');
        chrome.runtime.sendMessage({ type: 'LOGIN' });
      } else {
        showToast('Failed to load memory', 'error');
      }
    }
  }
  
  async function insertDocumentContent(source) {
    if (!activeInputElement) return;
    
    // Build content to insert: raw content first, then summary
    let content = '';
    
    // First add raw content
    if (source.raw_content?.messages) {
      const fullRawText = source.raw_content.messages.map(m => m.content).join('\n\n');
      const MAX_INSERT_CHARS = 12000;
      const rawText = fullRawText.length > MAX_INSERT_CHARS
        ? fullRawText.slice(fullRawText.length - MAX_INSERT_CHARS)
        : fullRawText;
      content = rawText;
    }
    
    // Then add summary below if available
    if (source.summary) {
      if (content) {
        content += '\n\n---\nSummary:\n' + source.summary;
      } else {
        content = source.summary;
      }
    }
    
    if (!content) {
      showToast('No content to insert', 'error');
      return;
    }
    
    // Insert into active element
    if (activeInputElement.isContentEditable || activeInputElement.getAttribute('contenteditable') === 'true') {
      // For contenteditable (like ChatGPT input)
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(activeInputElement);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      
      document.execCommand('insertText', false, content);
    } else {
      // For regular input/textarea
      const start = activeInputElement.selectionStart || 0;
      const end = activeInputElement.selectionEnd || 0;
      const value = activeInputElement.value || '';
      
      activeInputElement.value = value.substring(0, start) + content + value.substring(end);
      activeInputElement.selectionStart = activeInputElement.selectionEnd = start + content.length;
      
      // Trigger input event for React/Vue apps
      activeInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    closeMemoryPopup();
    showToast('Memory added to chat', 'success');
  }
  
  // Add keyboard listener
  document.addEventListener('keydown', handleKeyboardShortcut);
  
  // ============ UI Notifications ============
  
  function showNotification(message, type = 'info') {
    showToast(message, type);
  }
  
  function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.unimemory-toast');
    if (existing) existing.remove();
    
    // Create toast container
    const toast = document.createElement('div');
    toast.className = `unimemory-toast unimemory-toast-${type}`;
    
    // Add icon based on type
    let icon = '';
    if (type === 'loading') {
      icon = '<div class="unimemory-toast-spinner"></div>';
    } else if (type === 'success') {
      icon = '<svg class="unimemory-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    } else if (type === 'error') {
      icon = '<svg class="unimemory-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    }
    
    toast.innerHTML = `
      ${icon}
      <span class="unimemory-toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 5 seconds (except for loading)
    if (type !== 'loading') {
      setTimeout(() => {
        toast.classList.add('unimemory-toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }, 5000);
    }
  }
  
  // ============ Extension Control Popup ============
  
  let extensionPopup = null;
  let currentUser = null;
  let currentSettings = null;
  
  async function showExtensionPopup() {
    // Remove existing popup
    closeExtensionPopup();
    
    // Create popup
    extensionPopup = document.createElement('div');
    extensionPopup.className = 'unimemory-extension-popup';
    
    // Show loading state initially
    extensionPopup.innerHTML = `
      <div class="unimemory-extension-popup-loading">
        <div class="unimemory-extension-popup-spinner"></div>
      </div>
    `;
    
    document.body.appendChild(extensionPopup);
    
    // Check auth status
    try {
      const authResponse = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
      
      if (authResponse.authenticated && authResponse.user) {
        currentUser = authResponse.user;
        await showAuthenticatedPopup();
      } else {
        showNotAuthenticatedPopup();
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      showNotAuthenticatedPopup();
    }
    
    // Close on click outside
    document.addEventListener('click', handleOutsideClick);
  }
  
  function handleOutsideClick(e) {
    if (extensionPopup && !extensionPopup.contains(e.target)) {
      closeExtensionPopup();
    }
  }
  
  function closeExtensionPopup() {
    if (extensionPopup) {
      extensionPopup.remove();
      extensionPopup = null;
      document.removeEventListener('click', handleOutsideClick);
    }
  }
  
  function showNotAuthenticatedPopup() {
    if (!extensionPopup) return;
    
    const logoUrl = chrome.runtime.getURL('Unimemory-Name-Logo-NoBG.png');
    
    extensionPopup.innerHTML = `
      <div class="unimemory-extension-popup-header">
        <img src="${logoUrl}" alt="UniMemory" class="unimemory-extension-popup-logo" />
      </div>
      <div class="unimemory-extension-popup-content">
        <div class="unimemory-extension-popup-login">
          <p class="unimemory-extension-popup-login-subtitle">Unified Memory for all your AI applications.</p>
          <ul class="unimemory-extension-popup-features">
            <li>Save AI conversations and chats</li>
            <li>Search and retrieve your memories</li>
            <li>Insert context into any AI chat</li>
          </ul>
          <button class="unimemory-extension-popup-btn unimemory-extension-popup-btn-primary" id="ext-login-btn">
            Log in to UniMemory
          </button>
        </div>
      </div>
    `;
    
    // Add event listener
    const loginBtn = extensionPopup.querySelector('#ext-login-btn');
    loginBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'LOGIN' });
      closeExtensionPopup();
    });
  }
  
  async function showAuthenticatedPopup() {
    if (!extensionPopup) return;
    
    // Get current page info
    const pageInfo = {
      title: document.title || 'Current Page',
      url: window.location.href
    };
    
    // Load settings
    try {
      const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      currentSettings = settingsResponse.settings || { autoSave: false };
    } catch (error) {
      currentSettings = { autoSave: false };
    }
    
    const userName = currentUser.display_name || currentUser.email?.split('@')[0] || 'User';
    const userEmail = currentUser.email || '';
    const avatarContent = currentUser.avatar_url 
      ? `<img src="${currentUser.avatar_url}" alt="Avatar">`
      : userName.charAt(0).toUpperCase();
    const logoUrl = chrome.runtime.getURL('Unimemory-Name-Logo-NoBG.png');
    
    extensionPopup.innerHTML = `
      <div class="unimemory-extension-popup-header">
        <img src="${logoUrl}" alt="UniMemory" class="unimemory-extension-popup-logo" />
      </div>
      <div class="unimemory-extension-popup-tabs">
        <button class="unimemory-extension-popup-tab active" data-tab="save">Save</button>
        <button class="unimemory-extension-popup-tab" data-tab="settings">Settings</button>
        <button class="unimemory-extension-popup-tab" data-tab="guide">Guide</button>
      </div>
      <div class="unimemory-extension-popup-content">
        <!-- Save Tab -->
        <div id="ext-tab-save" class="ext-tab-content">
          <div class="unimemory-extension-popup-page-info">
            <div class="unimemory-extension-popup-page-title">${escapeHtml(pageInfo.title)}</div>
            <div class="unimemory-extension-popup-page-url">${escapeHtml(pageInfo.url)}</div>
          </div>
          
          <!-- Project Selector -->
          <div class="unimemory-extension-popup-project-selector">
            <label class="unimemory-extension-popup-project-label">Save to project:</label>
            <button id="ext-project-select-btn" class="unimemory-extension-popup-project-btn">
              <span id="ext-selected-project-name">Loading projects...</span>
              <svg class="unimemory-extension-popup-arrow-right" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </button>
          </div>
          
          <button class="unimemory-extension-popup-btn unimemory-extension-popup-btn-primary" id="ext-save-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 6px;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Save to UniMemory
          </button>
        </div>
        
        <!-- Settings Tab -->
        <div id="ext-tab-settings" class="ext-tab-content unimemory-extension-popup-hidden">
          <div class="unimemory-extension-popup-user-info">
            <div class="unimemory-extension-popup-avatar">${avatarContent}</div>
            <div class="unimemory-extension-popup-user-details">
              <span class="unimemory-extension-popup-user-name">${escapeHtml(userName)}</span>
              <span class="unimemory-extension-popup-user-email">${escapeHtml(userEmail)}</span>
            </div>
          </div>
          
          <div class="unimemory-extension-popup-setting">
            <div class="unimemory-extension-popup-setting-info">
              <span class="unimemory-extension-popup-setting-label">Save long-term memories</span>
              <span class="unimemory-extension-popup-setting-desc">Auto-save memories from your AI conversations</span>
            </div>
            <label class="unimemory-extension-popup-toggle">
              <input type="checkbox" id="ext-auto-save-toggle" ${currentSettings.autoSave ? 'checked' : ''}>
              <span class="unimemory-extension-popup-toggle-slider"></span>
            </label>
          </div>
          
          <div class="unimemory-extension-popup-buttons">
            <a href="https://unimemory-app.vercel.app" target="_blank" class="unimemory-extension-popup-btn unimemory-extension-popup-btn-secondary">
              Open Dashboard
            </a>
            <button class="unimemory-extension-popup-btn unimemory-extension-popup-btn-logout" id="ext-logout-btn">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Log out
            </button>
          </div>
        </div>
        
        <!-- Guide Tab -->
        <div id="ext-tab-guide" class="ext-tab-content unimemory-extension-popup-hidden">
          <div class="unimemory-extension-popup-guide-section">
            
            <div class="unimemory-extension-popup-guide-item">
              <div class="unimemory-extension-popup-guide-shortcut">
                <kbd class="unimemory-extension-popup-kbd">⌘</kbd>
                <span class="unimemory-extension-popup-guide-plus">+</span>
                <kbd class="unimemory-extension-popup-kbd">]</kbd>
              </div>
              <div class="unimemory-extension-popup-guide-desc">
                <span class="unimemory-extension-popup-guide-label">Search Sources</span>
                <span class="unimemory-extension-popup-guide-text">Open popup to search and insert saved sources</span>
              </div>
            </div>
            
            <div class="unimemory-extension-popup-guide-item">
              <div class="unimemory-extension-popup-guide-shortcut">
                <kbd class="unimemory-extension-popup-kbd">⌘</kbd>
                <span class="unimemory-extension-popup-guide-plus">+</span>
                <kbd class="unimemory-extension-popup-kbd">\\</kbd>
              </div>
              <div class="unimemory-extension-popup-guide-desc">
                <span class="unimemory-extension-popup-guide-label">Add Memories</span>
                <span class="unimemory-extension-popup-guide-text">Insert relevant memories into your input field</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    setupExtensionPopupListeners();
  }
  
  function setupExtensionPopupListeners() {
    // Tab switching
    const tabs = extensionPopup.querySelectorAll('.unimemory-extension-popup-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update visible content
        const saveTab = extensionPopup.querySelector('#ext-tab-save');
        const settingsTab = extensionPopup.querySelector('#ext-tab-settings');
        const guideTab = extensionPopup.querySelector('#ext-tab-guide');
        
        // Hide all tabs
        saveTab.classList.add('unimemory-extension-popup-hidden');
        settingsTab.classList.add('unimemory-extension-popup-hidden');
        guideTab.classList.add('unimemory-extension-popup-hidden');
        
        // Show selected tab
        if (targetTab === 'save') {
          saveTab.classList.remove('unimemory-extension-popup-hidden');
        } else if (targetTab === 'settings') {
          settingsTab.classList.remove('unimemory-extension-popup-hidden');
        } else if (targetTab === 'guide') {
          guideTab.classList.remove('unimemory-extension-popup-hidden');
        }
      });
    });
    
    // Project selector state
    let extSelectedProject = null;
    let extProjects = [];
    let showingProjectSelection = false;
    
    // Load projects and restore selection
    async function loadExtProjects() {
      try {
        console.log('[UniMemory] Loading projects for extension popup...');
        const response = await chrome.runtime.sendMessage({ type: 'GET_PROJECTS' });
        console.log('[UniMemory] Projects response:', response);
        
        // If session expired, show login screen
        if (response && response.needsLogin) {
          console.log('[UniMemory] Session expired, showing login screen');
          showNotAuthenticatedPopup();
          return;
        }
        
        if (response && response.success !== false) {
          extProjects = response.projects || [];
          console.log('[UniMemory] Loaded projects:', extProjects);
          
          if (extProjects.length > 0) {
            // Try to restore previously selected project
            const stored = await chrome.storage.local.get('ext_selected_project_id');
            const storedId = stored.ext_selected_project_id;
            
            let projectToSelect;
            if (storedId) {
              projectToSelect = extProjects.find(p => p.id === storedId);
              console.log('[UniMemory] Found stored project:', projectToSelect);
            }
            if (!projectToSelect) {
              projectToSelect = extProjects.find(p => p.is_default) || extProjects[0];
              console.log('[UniMemory] Using default/first project:', projectToSelect);
            }
            
            selectExtProject(projectToSelect);
          } else {
            console.warn('[UniMemory] No projects found');
            const nameEl = extensionPopup?.querySelector('#ext-selected-project-name');
            if (nameEl) nameEl.textContent = 'No projects';
          }
        } else {
          console.error('[UniMemory] Failed to load projects:', response?.error);
          const nameEl = extensionPopup?.querySelector('#ext-selected-project-name');
          if (nameEl) nameEl.textContent = 'Failed to load';
        }
      } catch (error) {
        console.error('[UniMemory] Error loading projects:', error);
        const nameEl = extensionPopup?.querySelector('#ext-selected-project-name');
        if (nameEl) nameEl.textContent = 'Error loading projects';
      }
    }
    
    function selectExtProject(project) {
      extSelectedProject = project;
      const nameEl = extensionPopup?.querySelector('#ext-selected-project-name');
      if (nameEl) {
        nameEl.textContent = project.name;
        console.log('[UniMemory] Updated project name in UI:', project.name);
      } else {
        console.warn('[UniMemory] Could not find project name element to update');
      }
      
      // Persist selection
      chrome.storage.local.set({ ext_selected_project_id: project.id });
    }
    
    function showProjectSelectionPage() {
      showingProjectSelection = true;
      
      const logoUrl = chrome.runtime.getURL('Unimemory-Name-Logo-NoBG.png');
      
      // Replace entire popup content with project selection
      extensionPopup.innerHTML = `
        <div class="unimemory-extension-popup-header">
          <img src="${logoUrl}" alt="UniMemory" class="unimemory-extension-popup-logo" />
        </div>
        <div class="unimemory-extension-popup-project-selection">
          <div class="unimemory-extension-popup-project-selection-header">
            <button id="ext-back-btn" class="unimemory-extension-popup-back-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              Back
            </button>
            <h3 class="unimemory-extension-popup-project-selection-title">Select Project</h3>
          </div>
          <div class="unimemory-extension-popup-project-grid" id="ext-project-grid"></div>
        </div>
      `;
      
      renderProjectGrid();
      
      // Back button
      const backBtn = extensionPopup.querySelector('#ext-back-btn');
      backBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showingProjectSelection = false;
        showAuthenticatedPopup();
      });
    }
    
    function renderProjectGrid() {
      const grid = extensionPopup.querySelector('#ext-project-grid');
      if (!grid) {
        console.error('[UniMemory] Project grid element not found');
        return;
      }
      
      console.log('[UniMemory] Rendering project grid with', extProjects.length, 'projects');
      grid.innerHTML = '';
      
      if (extProjects.length === 0) {
        console.warn('[UniMemory] No projects to display');
        grid.innerHTML = `
          <div class="unimemory-extension-popup-no-projects">
            <p>No projects found.</p>
            <p>Create a project in the dashboard first.</p>
          </div>
        `;
        return;
      }
      
      extProjects.forEach(project => {
        console.log('[UniMemory] Rendering project card:', project.name);
        const card = document.createElement('button');
        card.className = 'unimemory-extension-popup-project-card' + (extSelectedProject?.id === project.id ? ' selected' : '');
        card.textContent = project.name;
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectExtProject(project);
          showingProjectSelection = false;
          showAuthenticatedPopup();
        });
        grid.appendChild(card);
      });
      console.log('[UniMemory] Project grid rendered successfully');
    }
    
    // Load projects on popup open
    loadExtProjects();
    
    // Project select button
    const projectSelectBtn = extensionPopup.querySelector('#ext-project-select-btn');
    if (projectSelectBtn) {
      projectSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showProjectSelectionPage();
      });
    }
    
    // Save button
    const saveBtn = extensionPopup.querySelector('#ext-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        closeExtensionPopup();
        saveCurrentPageWithProject(extSelectedProject?.id);
      });
    }
    
    // Auto-save toggle
    const autoSaveToggle = extensionPopup.querySelector('#ext-auto-save-toggle');
    if (autoSaveToggle) {
      autoSaveToggle.addEventListener('change', async () => {
        try {
          await chrome.runtime.sendMessage({
            type: 'UPDATE_SETTINGS',
            settings: { autoSave: autoSaveToggle.checked }
          });
        } catch (error) {
          console.error('Failed to save settings:', error);
        }
      });
    }
    
    // Logout button
    const logoutBtn = extensionPopup.querySelector('#ext-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'LOGOUT' });
        showNotAuthenticatedPopup();
      });
    }
  }
  
  // ============ Message Listener ============
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_CURRENT_PAGE') {
      // Pass projectId from popup to save function
      saveCurrentPageWithProject(message.projectId);
      sendResponse({ success: true });
    } else if (message.type === 'SHOW_EXTENSION_POPUP') {
      showExtensionPopup();
      sendResponse({ success: true });
    }
    return true;
  });
  
  // Save with project support
  async function saveCurrentPageWithProject(projectId) {
    try {
      showToast('Saving...', 'info');
      
      const messages = extractMessages();
      
      if (messages.length === 0) {
        showToast('No chat messages found on this page', 'error');
        return;
      }
      
      const metadata = getPageMetadata();
      
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT',
        data: {
          platform: metadata.platform,
          conversationId: null,
          url: metadata.url,
          title: metadata.title,
          messages: messages,
          metadata: metadata,
          projectId: projectId || null  // Pass project ID
        }
      });
      
      if (response.success) {
        const memoryCount = response.data?.stored || 0;
        const title = response.data?.source_title || metadata.title || 'Chat';
        showToast(`Saved "${title}" - ${memoryCount} ${memoryCount === 1 ? 'memory' : 'memories'} extracted`, 'success');
      } else {
        if (response.error === 'Not authenticated' || response.error?.includes('Session expired')) {
          showToast('Session expired. Please log in again.', 'error');
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          showToast(response.error || 'Failed to save memory', 'error');
        }
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      showToast(error.message || 'Failed to save memory', 'error');
    }
  }

  // Listen for auth messages from UniMemory web app to authenticate the extension
  window.addEventListener('message', async (event) => {
    try {
      const allowedOrigins = [
        'https://unimemory-app.vercel.app',
        'https://app.unimemory.app',
      ];
      if (!allowedOrigins.includes(event.origin)) return;

      const data = event.data || {};
      if (data.type === 'UNIMEMORY_ID_TOKEN' && data.token) {
        const res = await chrome.runtime.sendMessage({
          type: 'REFRESH_SESSION',
          firebaseToken: data.token,
        });
        if (res && res.success) {
          showToast('UniMemory extension connected', 'success');
        } else {
          showToast('Failed to connect UniMemory extension', 'error');
        }
      }
    } catch (e) {
      // no-op
    }
  });
  
  // ============ Initialization ============
  
  async function init() {
    if (isInitialized) return;
    
    // Only initialize on AI chat pages
    if (!isAIChatPage()) {
      console.log('UniMemory: Not an AI chat page, skipping');
      return;
    }
    
    isInitialized = true;
    console.log('UniMemory: Universal chat detector initialized on', detectPlatform());
  }
  
  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
