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
      name: 'ChatGPT'
    },
    claude: {
      input: 'div[contenteditable="true"].ProseMirror',
      container: 'fieldset',
      name: 'Claude'
    },
    gemini: {
      input: 'div[contenteditable="true"].ql-editor, rich-textarea',
      container: 'form',
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
      showToast('Please type something first');
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
          showToast('Please log in to UniMemory first');
        } else {
          showToast(response.error || 'Failed to search memories');
        }
        return;
      }

      const memories = response.data?.results || [];
      
      if (memories.length === 0) {
        showToast('No related memories found');
        return;
      }

      // Insert memories into the prompt
      insertMemories(inputEl, promptText, memories);
      showToast(`Added ${memories.length} related memories`);

    } catch (error) {
      console.error('[UniMemory] Search error:', error);
      showToast('Failed to search memories');
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

  // Show toast notification
  function showToast(message) {
    // Remove existing toast
    const existingToast = document.getElementById('unimemory-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'unimemory-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a;
      color: white;
      padding: 10px 20px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 99999;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: unimemory-toast-in 0.3s ease;
      backdrop-filter: blur(10px);
    `;

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = 'unimemory-toast-out 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Add toast animation styles
  function addStyles() {
    if (document.getElementById('unimemory-inject-styles')) return;

    const style = document.createElement('style');
    style.id = 'unimemory-inject-styles';
    style.textContent = `
      @keyframes unimemory-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes unimemory-toast-out {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(20px); }
      }
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
