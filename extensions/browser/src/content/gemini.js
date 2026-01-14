/**
 * UniMemory - Gemini Content Script
 * Extracts conversations from Gemini and provides save functionality
 */

(function() {
  'use strict';
  
  const PLATFORM = 'gemini';
  let floatingButton = null;
  let isExtracting = false;
  
  // ============ Chat Extraction ============
  
  function extractConversation() {
    const messages = [];
    
    // Gemini uses specific selectors for conversation turns
    const turns = document.querySelectorAll('.conversation-turn, [class*="turn-content"]');
    
    turns.forEach((turn) => {
      const isUser = turn.querySelector('[class*="user-query"], [class*="query-text"]') !== null ||
                     turn.classList.toString().includes('user');
      
      const contentEl = turn.querySelector('.markdown-content, [class*="response-text"], [class*="query-text"]');
      
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
    
    // Fallback: Try message-content pattern
    if (messages.length === 0) {
      const messageBlocks = document.querySelectorAll('[data-message-id], .message-content');
      
      messageBlocks.forEach((block, index) => {
        const isUser = block.classList.toString().includes('user') || index % 2 === 0;
        const content = block.innerText.trim();
        
        if (content) {
          messages.push({
            role: isUser ? 'user' : 'assistant',
            content: content
          });
        }
      });
    }
    
    return messages;
  }
  
  function getConversationId() {
    // Extract from URL if available
    const match = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : `gemini-${Date.now()}`;
  }
  
  function getConversationTitle() {
    const titleEl = document.querySelector('title');
    let title = titleEl?.innerText?.replace(' - Gemini', '').replace('Gemini', '').trim();
    
    if (!title) {
      title = 'Gemini Conversation';
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
    const existing = document.querySelector('.unimemory-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `unimemory-notification unimemory-notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
  }
  
  // ============ Initialization ============
  
  async function init() {
    const authStatus = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.settings;
    
    if (!settings.platforms.gemini) {
      console.log('UniMemory: Gemini capture disabled');
      return;
    }
    
    createFloatingButton();
    
    if (!authStatus.authenticated) {
      floatingButton.classList.add('unimemory-needs-auth');
    }
    
    console.log('UniMemory: Gemini content script initialized');
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
