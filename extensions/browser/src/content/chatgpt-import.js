/**
 * ChatGPT Memory Import - Content Script
 * Injects "Save to UniMemory" button in ChatGPT's memory modal
 */

(function() {
  'use strict';

  // Configuration
  const UNIMEMORY_API = 'https://api.unimemory.app/api/v1';
  let isInjected = false;
  let observer = null;

  // UniMemory logo SVG (base64 encoded or inline)
  const UNIMEMORY_LOGO = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
      <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  /**
   * Get session token from extension storage
   */
  async function getSessionToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['sessionToken'], (result) => {
        resolve(result.sessionToken || null);
      });
    });
  }

  /**
   * Save a memory to UniMemory
   */
  async function saveMemoryToUniMemory(memoryText) {
    try {
      const sessionToken = await getSessionToken();
      
      if (!sessionToken) {
        showToast('Please log in to UniMemory extension first', 'error');
        return false;
      }

      const response = await fetch(`${UNIMEMORY_API}/memories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          content: memoryText,
          tags: ['chatgpt-import'],
          app_id: 'ChatGPT Import',
          metadata: {
            source: 'chatgpt_personalization',
            imported_at: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to save memory to UniMemory:', error);
      showToast('Failed to save to UniMemory', 'error');
      return false;
    }
  }

  /**
   * Show toast notification
   */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `unimemory-toast unimemory-toast-${type}`;
    toast.textContent = message;
    
    // Inject styles if not already present
    if (!document.getElementById('unimemory-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'unimemory-toast-styles';
      style.textContent = `
        .unimemory-toast {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          z-index: 10000;
          animation: slideIn 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .unimemory-toast-success {
          background: #10b981;
          color: white;
        }
        .unimemory-toast-error {
          background: #ef4444;
          color: white;
        }
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Inject "Save to UniMemory" button into memory items
   */
  function injectSaveButtons() {
    // Find all memory items in the modal
    // ChatGPT's memory modal structure may vary, so we need to be flexible
    const memoryItems = document.querySelectorAll('[class*="memory"], [data-testid*="memory"]');
    
    if (memoryItems.length === 0) {
      // Try alternative selectors for ChatGPT's memory list
      const alternativeItems = document.querySelectorAll('div[role="listitem"], li');
      alternativeItems.forEach(item => {
        if (item.textContent.length > 20 && !item.querySelector('.unimemory-save-btn')) {
          injectButtonIntoItem(item);
        }
      });
      return;
    }

    memoryItems.forEach(item => {
      if (!item.querySelector('.unimemory-save-btn')) {
        injectButtonIntoItem(item);
      }
    });
  }

  /**
   * Inject save button into a specific memory item
   */
  function injectButtonIntoItem(item) {
    // Extract memory text from the item
    const memoryText = item.textContent.trim();
    
    if (!memoryText || memoryText.length < 5) {
      return; // Skip empty or very short items
    }

    // Create save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'unimemory-save-btn';
    saveBtn.innerHTML = `
      ${UNIMEMORY_LOGO}
      <span>Save to UniMemory</span>
    `;
    
    // Inject button styles if not already present
    if (!document.getElementById('unimemory-button-styles')) {
      const style = document.createElement('style');
      style.id = 'unimemory-button-styles';
      style.textContent = `
        .unimemory-save-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          margin-top: 8px;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .unimemory-save-btn:hover {
          background: #4f46e5;
          transform: translateY(-1px);
        }
        .unimemory-save-btn:active {
          transform: translateY(0);
        }
        .unimemory-save-btn svg {
          width: 16px;
          height: 16px;
        }
        .unimemory-save-btn.saving {
          opacity: 0.6;
          pointer-events: none;
        }
        .unimemory-save-btn.saved {
          background: #10b981;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Add click handler
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      saveBtn.classList.add('saving');
      saveBtn.innerHTML = `
        <span>Saving...</span>
      `;
      
      const success = await saveMemoryToUniMemory(memoryText);
      
      if (success) {
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('saved');
        saveBtn.innerHTML = `
          <span>✓ Saved</span>
        `;
        showToast('Memory saved to UniMemory!', 'success');
        
        // Reset button after 2 seconds
        setTimeout(() => {
          saveBtn.classList.remove('saved');
          saveBtn.innerHTML = `
            ${UNIMEMORY_LOGO}
            <span>Save to UniMemory</span>
          `;
        }, 2000);
      } else {
        saveBtn.classList.remove('saving');
        saveBtn.innerHTML = `
          ${UNIMEMORY_LOGO}
          <span>Save to UniMemory</span>
        `;
      }
    });
    
    // Append button to item
    item.appendChild(saveBtn);
  }

  /**
   * Observe DOM changes to inject buttons when modal appears
   */
  function startObserving() {
    if (observer) {
      return; // Already observing
    }

    observer = new MutationObserver((mutations) => {
      // Check if we're on the personalization settings page
      const isPersonalizationPage = window.location.hash.includes('settings/Personalization');
      
      if (isPersonalizationPage && !isInjected) {
        // Wait a bit for the modal to fully render
        setTimeout(() => {
          injectSaveButtons();
          isInjected = true;
        }, 1000);
      } else if (!isPersonalizationPage) {
        isInjected = false;
      }
      
      // Re-inject if new memory items appear
      if (isPersonalizationPage) {
        injectSaveButtons();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Initialize the content script
   */
  function init() {
    // Check if we're on ChatGPT
    if (!window.location.hostname.includes('chatgpt.com')) {
      return;
    }

    console.log('[UniMemory] ChatGPT import content script loaded');
    
    // Start observing for memory modal
    startObserving();
    
    // Initial injection if already on personalization page
    if (window.location.hash.includes('settings/Personalization')) {
      setTimeout(() => {
        injectSaveButtons();
        isInjected = true;
      }, 2000);
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
