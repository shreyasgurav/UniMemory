/**
 * UniMemory - Memory Injection Content Script
 * Injects UniMemory button into AI chat inputs for memory retrieval
 * Supports: ChatGPT, Claude, Gemini
 */

(function() {
  'use strict';

  const MEMORIES_BLOCK_ID = 'unimemory-memories-block';
  
  // Platform-specific input selectors
  const PLATFORM_SELECTORS = {
    chatgpt: {
      input: '#prompt-textarea, div[contenteditable="true"][data-placeholder]',
      container: 'form',
      sendButton: 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"]',
      name: 'ChatGPT'
    },
    claude: {
      input: 'div[contenteditable="true"].ProseMirror',
      container: 'fieldset',
      sendButton: 'button[aria-label*="Send"], button[type="submit"]',
      name: 'Claude'
    },
    gemini: {
      input: 'div[contenteditable="true"].ql-editor, rich-textarea',
      container: 'form',
      sendButton: 'button[aria-label*="Send"], button[type="submit"]',
      name: 'Gemini'
    }
  };

  let currentPlatform = null;
  let isLoading = false;

  // Detect current platform
  function detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
      return 'chatgpt';
    }
    if (hostname.includes('claude.ai')) {
      return 'claude';
    }
    if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) {
      return 'gemini';
    }
    return null;
  }

  // Find the chat input element
  function findChatInput() {
    if (!currentPlatform) return null;
    const selector = PLATFORM_SELECTORS[currentPlatform].input;
    return document.querySelector(selector);
  }

  // Find the input container
  function findInputContainer(inputEl) {
    if (!currentPlatform || !inputEl) return null;
    const containerSelector = PLATFORM_SELECTORS[currentPlatform].container;
    return inputEl.closest(containerSelector) || inputEl.parentElement;
  }

  // Get the prompt text from input
  function getPromptText(inputEl) {
    if (!inputEl) return '';
    
    // Handle textarea
    if (inputEl.tagName === 'TEXTAREA') {
      return inputEl.value.trim();
    }
    
    // Handle contenteditable
    return inputEl.innerText.trim();
  }

  // Set the prompt text in input
  function setPromptText(inputEl, text) {
    if (!inputEl) return;
    
    // Handle textarea
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      // Trigger input event for React
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    
    // Handle contenteditable
    inputEl.innerText = text;
    // Trigger input event for React
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Setup keyboard shortcut listener (Cmd+\ for Mac, Ctrl+\ for Windows)
  function setupKeyboardShortcut() {
    document.addEventListener('keydown', async (e) => {
      // Check for Cmd+\ (Mac) or Ctrl+\ (Windows)
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key === '\\';
      
      if (!isShortcut) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const input = findChatInput();
      if (!input) return;
      
      await handleMemorySearch(input);
    });
    
    console.log('[UniMemory] Keyboard shortcut (Cmd+\\ / Ctrl+\\) enabled for', currentPlatform);
  }

  // Listen for context menu trigger from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CONTEXT_MENU_CLICKED') {
      const input = findChatInput();
      if (input) {
        handleMemorySearch(input);
      }
      sendResponse({ success: true });
    }
  });

  // Handle memory search
  async function handleMemorySearch(inputEl) {
    if (isLoading) return;

    const promptText = getPromptText(inputEl);
    if (!promptText) {
      showNotification('Please type something first', 'info');
      return;
    }

    isLoading = true;
    showNotification('Searching memories...', 'loading');

    try {
      // Search for memories via background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_NUCLEAR_MEMORIES',
        query: promptText
      });

      if (!response.success) {
        if (response.error === 'Not authenticated') {
          showNotification('Please log in to UniMemory first', 'error');
        } else {
          showNotification(response.error || 'Failed to search memories', 'error');
        }
        return;
      }

      const memories = Array.isArray(response.memories)
        ? response.memories
        : [];
      
      if (memories.length === 0) {
        showNotification('No related memories found', 'info');
        return;
      }

      // Insert memories into the input
      insertMemories(inputEl, promptText, memories);
      
      // Show success notification with count
      showNotification(`Added ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`, 'success');
    } catch (error) {
      console.error('[UniMemory] Search error:', error);
      showNotification('Failed to search memories', 'error');
    } finally {
      isLoading = false;
    }
  }

  // Insert memories below the prompt
  function insertMemories(inputEl, originalPrompt, memories) {
    const memoryText = memories
      .slice(0, 5) // Limit to 5 memories
      .map(m => `• ${m.content}`)
      .join('\n');

    const newPrompt = `${originalPrompt}

---
🧠 Related memories from UniMemory:
${memoryText}
---`;

    setPromptText(inputEl, newPrompt);
    
    // Focus back on input
    inputEl.focus();
    
    // Move cursor to end
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
    } else {
      // For contenteditable
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(inputEl);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Show notification popup (top-right, white curvy toast matching save page style)
  function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.unimemory-toast');
    if (existing) existing.remove();
    
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
    } else if (type === 'info') {
      icon = '<svg class="unimemory-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
    
    toast.innerHTML = `
      ${icon}
      <span class="unimemory-toast-message">${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Auto-remove after 3 seconds (except for loading)
    if (type !== 'loading') {
      setTimeout(() => {
        toast.classList.add('unimemory-toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  }

  // Add minimal styles (toast styles are in extension.css)
  function addStyles() {
    if (document.getElementById('unimemory-inject-styles')) return;

    const style = document.createElement('style');
    style.id = 'unimemory-inject-styles';
    style.textContent = `
      .unimemory-spinner {
        animation: unimemory-spin 1s linear infinite;
      }
      @keyframes unimemory-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .unimemory-inject-button:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
      }
    `;
    document.head.appendChild(style);
  }

  // Capture and ingest user prompt
  async function captureAndIngestPrompt(promptText) {
    if (!promptText || promptText.trim().length === 0) return;
    
    try {
      // Send to background script for ingestion
      const response = await chrome.runtime.sendMessage({
        type: 'INGEST_PROMPT',
        data: {
          prompt: promptText,
          platform: currentPlatform
        }
      });
      
      if (response?.success) {
        console.log('[UniMemory] Prompt ingested successfully');
      }
    } catch (error) {
      console.error('[UniMemory] Failed to ingest prompt:', error);
    }
  }

  // Monitor send button clicks to capture prompts
  function monitorSendButton() {
    if (!currentPlatform) return;
    
    const sendButtonSelector = PLATFORM_SELECTORS[currentPlatform].sendButton;
    console.log('[UniMemory] Monitoring send button with selector:', sendButtonSelector);
    
    // Use event delegation on document for dynamically added buttons
    document.addEventListener('click', async (e) => {
      const sendButton = e.target.closest(sendButtonSelector);
      if (!sendButton) return;
      
      console.log('[UniMemory] Send button clicked');
      
      // Get the input element
      const input = findChatInput();
      if (!input) {
        console.log('[UniMemory] No input found');
        return;
      }
      
      // Capture the prompt text
      const promptText = getPromptText(input);
      if (!promptText) {
        console.log('[UniMemory] No prompt text');
        return;
      }
      
      console.log('[UniMemory] Captured prompt:', promptText.substring(0, 50) + '...');
      
      // Ingest the prompt asynchronously (don't block the send)
      setTimeout(() => {
        captureAndIngestPrompt(promptText);
      }, 100);
    }, true); // Use capture phase to catch before React handlers
    
    // Also monitor Enter key press in input
    document.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      if (e.shiftKey) return; // Shift+Enter is for new line
      
      const input = findChatInput();
      if (!input) return;
      if (!input.contains(e.target)) return;
      
      const promptText = getPromptText(input);
      if (!promptText) return;
      
      console.log('[UniMemory] Enter key pressed, captured:', promptText.substring(0, 50) + '...');
      
      setTimeout(() => {
        captureAndIngestPrompt(promptText);
      }, 100);
    }, true);
  }

  // Initialize on supported platforms
  function init() {
    currentPlatform = detectPlatform();
    if (!currentPlatform) return;

    console.log('[UniMemory] Initializing for', currentPlatform);
    addStyles();

    // Setup keyboard shortcut (Cmd+\ or Ctrl+\)
    setupKeyboardShortcut();
    
    // Start monitoring send button for automatic prompt capture
    monitorSendButton();
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
