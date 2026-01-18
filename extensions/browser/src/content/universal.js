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
  
  let lastRecallResult = null;  // Store last recall for context insertion
  
  async function showMemoryPopup() {
    // Remove existing popup
    closeMemoryPopup();
    
    // Get current input text for semantic search
    let currentQuery = '';
    if (activeInputElement) {
      if (activeInputElement.isContentEditable || activeInputElement.getAttribute('contenteditable') === 'true') {
        currentQuery = activeInputElement.innerText || activeInputElement.textContent || '';
      } else {
        currentQuery = activeInputElement.value || '';
      }
      currentQuery = currentQuery.trim().substring(0, 500);
    }
    
    // Create popup
    memoryPopup = document.createElement('div');
    memoryPopup.className = 'unimemory-popup';
    memoryPopup.innerHTML = `
      <div class="unimemory-popup-content">
        <input type="text" class="unimemory-popup-search" placeholder="Describe what you need..." autofocus />
        <div class="unimemory-popup-list">
          <div class="unimemory-popup-loading">Loading...</div>
        </div>
        <div class="unimemory-popup-footer">
          <button class="unimemory-popup-insert-all">Insert All Context</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(memoryPopup);
    
    // Set initial query and focus
    const searchInput = memoryPopup.querySelector('.unimemory-popup-search');
    searchInput.value = currentQuery;
    searchInput.focus();
    searchInput.select();
    
    // Load with current query (semantic search on full sentence)
    await loadRecallResults(currentQuery);
    
    // Search on input (debounced)
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => loadRecallResults(e.target.value), 400);
    });
    
    // Insert all context button
    memoryPopup.querySelector('.unimemory-popup-insert-all').addEventListener('click', insertAllContext);
    
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
    lastRecallResult = null;
  }
  
  async function loadRecallResults(query) {
    const listEl = memoryPopup?.querySelector('.unimemory-popup-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<div class="unimemory-popup-loading">Searching...</div>';
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_MEMORIES',
        query: query
      });
      
      if (!response.success) {
        listEl.innerHTML = '<div class="unimemory-popup-empty">Failed to search</div>';
        return;
      }
      
      const result = response.data || {};
      lastRecallResult = result;
      
      const memories = result.memories || [];
      const sources = result.sources || [];
      
      if (memories.length === 0 && sources.length === 0) {
        listEl.innerHTML = '<div class="unimemory-popup-empty">No relevant context found</div>';
        return;
      }
      
      listEl.innerHTML = '';
      
      // Show memories first (atomic facts)
      if (memories.length > 0) {
        const memSection = document.createElement('div');
        memSection.className = 'unimemory-popup-section';
        memSection.innerHTML = '<div class="unimemory-popup-section-title">Memories</div>';
        memories.forEach(mem => {
          const card = createMemoryCard(mem);
          memSection.appendChild(card);
        });
        listEl.appendChild(memSection);
      }
      
      // Show sources (context anchors)
      if (sources.length > 0) {
        const srcSection = document.createElement('div');
        srcSection.className = 'unimemory-popup-section';
        srcSection.innerHTML = '<div class="unimemory-popup-section-title">Related Discussions</div>';
        sources.forEach(src => {
          const card = createSourceCard(src);
          srcSection.appendChild(card);
        });
        listEl.appendChild(srcSection);
      }
      
    } catch (error) {
      console.error('Failed to recall:', error);
      listEl.innerHTML = '<div class="unimemory-popup-empty">Failed to search</div>';
    }
  }
  
  function createMemoryCard(memory) {
    const card = document.createElement('div');
    card.className = 'unimemory-popup-card unimemory-popup-card-memory';
    
    const content = memory.content || '';
    const score = memory.score ? `${Math.round(memory.score * 100)}%` : '';
    
    card.innerHTML = `
      <div class="unimemory-popup-card-content">${escapeHtml(content)}</div>
      ${score ? `<div class="unimemory-popup-card-score">${score}</div>` : ''}
    `;
    
    card.addEventListener('click', () => insertContent(content));
    return card;
  }
  
  function createSourceCard(source) {
    const card = document.createElement('div');
    card.className = 'unimemory-popup-card unimemory-popup-card-source';
    
    const title = source.title || 'Untitled';
    const summary = source.summary || '';
    const score = source.score ? `${Math.round(source.score * 100)}%` : '';
    
    card.innerHTML = `
      <div class="unimemory-popup-card-title">${escapeHtml(title)}</div>
      <div class="unimemory-popup-card-summary">${escapeHtml(summary.substring(0, 120))}${summary.length > 120 ? '...' : ''}</div>
      ${score ? `<div class="unimemory-popup-card-score">${score}</div>` : ''}
    `;
    
    card.addEventListener('click', () => insertContent(`[From: ${title}]\n${summary}`));
    return card;
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function insertContent(text) {
    if (!activeInputElement || !text) return;
    
    // Insert into active element
    if (activeInputElement.isContentEditable || activeInputElement.getAttribute('contenteditable') === 'true') {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(activeInputElement);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, text + '\n\n');
    } else {
      const start = activeInputElement.selectionStart || 0;
      const end = activeInputElement.selectionEnd || 0;
      const value = activeInputElement.value || '';
      const insertText = text + '\n\n';
      activeInputElement.value = value.substring(0, start) + insertText + value.substring(end);
      activeInputElement.selectionStart = activeInputElement.selectionEnd = start + insertText.length;
      activeInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    closeMemoryPopup();
    showToast('Context added', 'success');
  }
  
  function insertAllContext() {
    if (!activeInputElement || !lastRecallResult) return;
    
    // Use the pre-formatted context_block from API
    if (lastRecallResult.context_block) {
      insertContent(lastRecallResult.context_block);
      return;
    }
    
    // Fallback: build context manually
    let context = '';
    const memories = lastRecallResult.memories || [];
    const sources = lastRecallResult.sources || [];
    
    if (memories.length > 0) {
      context += 'Relevant context from your memory:\n\n';
      memories.forEach(m => {
        context += `- ${m.content}\n`;
      });
      context += '\n';
    }
    
    if (sources.length > 0) {
      context += 'Related discussions:\n';
      sources.forEach(s => {
        const title = s.title || 'Untitled';
        const summary = s.summary ? s.summary.substring(0, 100) + '...' : '';
        context += `- ${title}: ${summary}\n`;
      });
      context += '\n';
    }
    
    if (context) {
      insertContent(context);
    } else {
      showToast('No context to insert', 'error');
    }
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
  
  // ============ Message Listener ============
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SAVE_CURRENT_PAGE') {
      saveCurrentPage();
      sendResponse({ success: true });
    }
    return true;
  });

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
