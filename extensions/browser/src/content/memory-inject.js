/**
 * UniMemory - Memory Injection Content Script
 * Injects UniMemory button into AI chat inputs for memory retrieval
 * Supports: ChatGPT, Claude, Gemini
 */

(function() {
  'use strict';

  const BUTTON_ID = 'unimemory-inject-btn';
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

  // Create the UniMemory button
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.title = 'Add related memories from UniMemory';
    
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('icons/unimemory-logo.png');
    img.alt = 'UniMemory';
    img.style.cssText = 'width: 20px; height: 20px; object-fit: contain;';
    
    btn.appendChild(img);
    btn.className = 'unimemory-inject-button';
    
    // Create tooltip (placed below the button)
    const tooltip = document.createElement('div');
    tooltip.className = 'unimemory-tooltip';
    tooltip.textContent = 'Add memories';
    tooltip.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%) scale(0.9);
      background: #000;
      color: white;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: all 0.2s ease;
      z-index: 10000;
    `;
    btn.appendChild(tooltip);
    
    return btn;
  }

  // Create loading spinner
  function createSpinner() {
    return `
      <svg class="unimemory-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="32" stroke-dashoffset="8">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
        </circle>
      </svg>
    `;
  }

  // Inject button into the input area
  function injectButton(inputEl) {
    if (!inputEl) return;
    if (document.getElementById(BUTTON_ID)) return;

    const container = findInputContainer(inputEl);
    if (!container) return;

    // Make container relative for absolute positioning
    const containerStyle = window.getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    const btn = createButton();
    
    // Platform-specific positioning and sizing
    let positionStyle = '';
    let buttonSize = '36px';
    
    if (currentPlatform === 'claude') {
      // Claude: position on left side after + and clock icons, smaller size
      positionStyle = `
        left: 100px;
        bottom: 10px;
      `;
      buttonSize = '32px';
    } else if (currentPlatform === 'gemini') {
      // Gemini: position on right side near tools section
      positionStyle = `
        right: 120px;
        bottom: 10px;
      `;
    } else {
      // ChatGPT: position on right side before dictate button
      positionStyle = `
        right: 90px;
        bottom: 10px;
      `;
    }
    
    btn.style.cssText = `
      position: absolute;
      ${positionStyle}
      width: ${buttonSize};
      height: ${buttonSize};
      border-radius: 9999px;
      border: none;
      background: transparent;
      cursor: pointer;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      transition: all 0.2s ease;
      outline: none;
      box-shadow: none;
    `;

    btn.addEventListener('mouseenter', () => {
      if (!isLoading) {
        btn.style.background = '#454545';
        const tooltip = btn.querySelector('.unimemory-tooltip');
        if (tooltip) {
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'translateX(-50%) scale(1)';
        }
      }
    });

    btn.addEventListener('mouseleave', () => {
      if (!isLoading) {
        btn.style.background = 'transparent';
        const tooltip = btn.querySelector('.unimemory-tooltip');
        if (tooltip) {
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'translateX(-50%) scale(0.9)';
        }
      }
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleButtonClick(inputEl, btn);
    });

    container.appendChild(btn);
    console.log('[UniMemory] Button injected for', currentPlatform);
  }

  // Handle button click
  async function handleButtonClick(inputEl, btn) {
    if (isLoading) return;

    const promptText = getPromptText(inputEl);
    if (!promptText) {
      showNotification('Please type something first', 'info');
      return;
    }

    isLoading = true;
    btn.innerHTML = createSpinner();
    btn.style.cursor = 'wait';

    try {
      // Search for memories via background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEARCH_MEMORIES',
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

      const memories = response.data?.results || [];
      
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
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/unimemory-logo.png');
      img.alt = 'UniMemory';
      img.style.cssText = 'width: 20px; height: 20px; object-fit: contain;';
      btn.innerHTML = '';
      btn.appendChild(img);
      btn.style.cursor = 'pointer';
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
    
    // Use event delegation on document for dynamically added buttons
    document.addEventListener('click', async (e) => {
      const sendButton = e.target.closest(sendButtonSelector);
      if (!sendButton) return;
      
      // Get the input element
      const input = findChatInput();
      if (!input) return;
      
      // Capture the prompt text
      const promptText = getPromptText(input);
      if (!promptText) return;
      
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
      
      setTimeout(() => {
        captureAndIngestPrompt(promptText);
      }, 100);
    }, true);
  }

  // Initialize on supported platforms
  function init() {
    currentPlatform = detectPlatform();
    if (!currentPlatform) return;

    console.log('[UniMemory] Memory inject initialized for', currentPlatform);
    addStyles();

    // Try to inject button immediately
    const input = findChatInput();
    if (input) {
      injectButton(input);
    }

    // Start monitoring send button for automatic prompt capture
    monitorSendButton();

    // Watch for DOM changes (React apps update frequently)
    const observer = new MutationObserver(() => {
      const input = findChatInput();
      if (input && !document.getElementById(BUTTON_ID)) {
        injectButton(input);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
