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
  
  // ============ Universal Message Extraction ============
  
  function extractMessages() {
    const messages = [];
    
    // Strategy 1: Look for alternating message patterns
    const messageSelectors = [
      '[data-message-author-role]',
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
      '[class*="message-"]',
      '.message',
      '.chat-message'
    ];
    
    for (const selector of messageSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el, index) => {
          const text = extractTextContent(el);
          if (text && text.length > 10) {
            // Determine role by position or attributes
            const role = determineRole(el, index);
            messages.push({ role, content: text });
          }
        });
        
        if (messages.length > 0) break;
      }
    }
    
    // Strategy 2: If no structured messages, extract all text blocks
    if (messages.length === 0) {
      const textBlocks = extractTextBlocks();
      textBlocks.forEach((text, index) => {
        messages.push({
          role: index % 2 === 0 ? 'user' : 'assistant',
          content: text
        });
      });
    }
    
    return messages;
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
    return {
      url: window.location.href,
      title: document.title,
      platform: detectPlatform(),
      timestamp: new Date().toISOString()
    };
  }
  
  function detectPlatform() {
    const url = window.location.hostname;
    
    if (url.includes('openai.com') || url.includes('chatgpt.com')) return 'ChatGPT';
    if (url.includes('claude.ai')) return 'Claude';
    if (url.includes('gemini.google.com') || url.includes('bard.google.com')) return 'Gemini';
    if (url.includes('poe.com')) return 'Poe';
    if (url.includes('perplexity.ai')) return 'Perplexity';
    if (url.includes('you.com')) return 'You.com';
    if (url.includes('character.ai')) return 'Character.AI';
    if (url.includes('huggingface.co')) return 'HuggingFace';
    
    return 'Unknown AI Chat';
  }
  
  // ============ Save Functionality ============
  
  async function saveCurrentPage() {
    try {
      const messages = extractMessages();
      
      if (messages.length === 0) {
        showNotification('No chat messages found on this page', 'error');
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
        showNotification(`Saved ${messages.length} messages to UniMemory`, 'success');
      } else {
        if (response.error === 'Not authenticated') {
          showNotification('Please log in to UniMemory first', 'error');
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          showNotification(response.error || 'Failed to save', 'error');
        }
      }
    } catch (error) {
      console.error('Failed to save page:', error);
      showNotification('Failed to save page', 'error');
    }
  }
  
  // ============ UI Notifications ============
  
  function showNotification(message, type = 'info') {
    const existing = document.querySelector('.unimemory-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `unimemory-notification unimemory-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
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
          showNotification('UniMemory extension connected', 'success');
        } else {
          showNotification('Failed to connect UniMemory extension', 'error');
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
