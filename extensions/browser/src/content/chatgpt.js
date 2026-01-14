/**
 * UniMemory - ChatGPT Content Script
 * Extracts conversations from ChatGPT and provides save functionality
 */

(function() {
  'use strict';
  
  const PLATFORM = 'chatgpt';
  let floatingButton = null;
  let isExtracting = false;
  
  // ============ Chat Extraction ============
  
  function extractConversation() {
    const messages = [];
    
    // ChatGPT uses data-message-author-role attribute
    const messageElements = document.querySelectorAll('[data-message-author-role]');
    
    messageElements.forEach((el) => {
      const role = el.getAttribute('data-message-author-role');
      const contentEl = el.querySelector('.markdown, .whitespace-pre-wrap');
      
      if (contentEl && role) {
        const content = contentEl.innerText.trim();
        if (content) {
          messages.push({
            role: role === 'user' ? 'user' : 'assistant',
            content: content
          });
        }
      }
    });
    
    // Fallback: Try alternative selectors for newer ChatGPT UI
    if (messages.length === 0) {
      const turnElements = document.querySelectorAll('[data-testid^="conversation-turn"]');
      
      turnElements.forEach((turn, index) => {
        const isUser = turn.querySelector('[data-message-author-role="user"]') !== null;
        const contentEl = turn.querySelector('.markdown, .whitespace-pre-wrap, [class*="prose"]');
        
        if (contentEl) {
          const content = contentEl.innerText.trim();
          if (content) {
            messages.push({
              role: isUser ? 'user' : 'assistant',
              content: content
            });
          }
        }
      });
    }
    
    return messages;
  }
  
  function getConversationId() {
    // Extract from URL: /c/conversation-id or /chat/conversation-id
    const match = window.location.pathname.match(/\/(?:c|chat)\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }
  
  function getConversationTitle() {
    // Try to get title from the page
    const titleEl = document.querySelector('title');
    let title = titleEl?.innerText?.replace(' | ChatGPT', '').trim();
    
    // Fallback to sidebar active item
    if (!title || title === 'ChatGPT') {
      const activeNavItem = document.querySelector('[class*="bg-token-sidebar-surface-secondary"]');
      title = activeNavItem?.innerText?.trim() || 'ChatGPT Conversation';
    }
    
    return title;
  }
  
  // ============ Save Functionality ============
  
  async function saveConversation() {
    if (isExtracting) return;
    isExtracting = true;
    
    updateButtonState('saving');
    
    try {
      const messages = extractConversation();
      
      if (messages.length === 0) {
        showNotification('No messages found to save', 'error');
        updateButtonState('idle');
        isExtracting = false;
        return;
      }
      
      const chatData = {
        platform: PLATFORM,
        conversationId: getConversationId(),
        url: window.location.href,
        title: getConversationTitle(),
        messages: messages
      };
      
      // Send to background script
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_CHAT',
        data: chatData
      });
      
      if (response.success) {
        showNotification(`Saved ${messages.length} messages to UniMemory`, 'success');
        updateButtonState('saved');
        setTimeout(() => updateButtonState('idle'), 3000);
      } else {
        if (response.error === 'Not authenticated') {
          showNotification('Please log in to UniMemory first', 'error');
          chrome.runtime.sendMessage({ type: 'LOGIN' });
        } else {
          showNotification(response.error || 'Failed to save', 'error');
        }
        updateButtonState('idle');
      }
    } catch (error) {
      console.error('Failed to save conversation:', error);
      showNotification('Failed to save conversation', 'error');
      updateButtonState('idle');
    }
    
    isExtracting = false;
  }
  
  // ============ Floating Button ============
  
  function createFloatingButton() {
    if (floatingButton) return;
    
    floatingButton = document.createElement('div');
    floatingButton.id = 'unimemory-floating-button';
    floatingButton.className = 'unimemory-btn';
    floatingButton.innerHTML = `
      <div class="unimemory-btn-content">
        <svg class="unimemory-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span class="unimemory-text">Save to UniMemory</span>
      </div>
      <div class="unimemory-btn-saving">
        <svg class="unimemory-spinner" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="60" stroke-dashoffset="20"/>
        </svg>
        <span>Saving...</span>
      </div>
      <div class="unimemory-btn-saved">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        <span>Saved!</span>
      </div>
    `;
    
    floatingButton.addEventListener('click', saveConversation);
    document.body.appendChild(floatingButton);
  }
  
  function updateButtonState(state) {
    if (!floatingButton) return;
    
    floatingButton.classList.remove('saving', 'saved');
    if (state === 'saving') {
      floatingButton.classList.add('saving');
    } else if (state === 'saved') {
      floatingButton.classList.add('saved');
    }
  }
  
  function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.unimemory-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `unimemory-notification unimemory-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => notification.remove(), 3000);
  }
  
  // ============ Initialization ============
  
  async function init() {
    // Check if we're authenticated
    const authStatus = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
    
    // Check settings to see if this platform is enabled
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.settings;
    
    if (!settings.platforms.chatgpt) {
      console.log('UniMemory: ChatGPT capture disabled');
      return;
    }
    
    // Create floating button
    createFloatingButton();
    
    // If not authenticated, show login prompt on first interaction
    if (!authStatus.authenticated) {
      floatingButton.classList.add('unimemory-needs-auth');
    }
    
    console.log('UniMemory: ChatGPT content script initialized');
  }
  
  // Wait for page to fully load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to ensure ChatGPT UI is loaded
    setTimeout(init, 1000);
  }
})();
