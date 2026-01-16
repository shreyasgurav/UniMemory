/**
 * Save Chat Command
 * Explicitly save a conversation/chat to UniMemory
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from '../api/client';
import { StatusBarManager } from '../ui/statusBar';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function saveChatCommand(
  client: UniMemoryClient,
  statusBar: StatusBarManager
): Promise<void> {
  // Check authentication
  if (!(await client.isAuthenticated())) {
    const action = await vscode.window.showWarningMessage(
      'Please login to UniMemory first',
      'Login'
    );
    if (action === 'Login') {
      vscode.commands.executeCommand('unimemory.login');
    }
    return;
  }

  // Try to get chat content from various sources
  const chatContent = await getChatContent();
  
  if (!chatContent || chatContent.messages.length === 0) {
    vscode.window.showWarningMessage(
      'No chat content found. You can paste chat content manually.'
    );
    
    // Allow manual input
    const manualContent = await vscode.window.showInputBox({
      prompt: 'Paste chat content or conversation summary',
      placeHolder: 'Enter the conversation you want to save...'
    });
    
    if (!manualContent) {
      return;
    }
    
    chatContent.messages = [{ role: 'user', content: manualContent }];
  }

  // Ask for optional title
  const title = await vscode.window.showInputBox({
    prompt: 'Give this chat a title (optional)',
    placeHolder: 'e.g., "Setting up authentication flow"'
  }) || `Chat from ${new Date().toLocaleDateString()}`;

  statusBar.setLoading('Saving chat...');

  try {
    const platform = detectEditorType();
    
    const result = await client.ingestChat(chatContent.messages, {
      platform,
      title,
      url: vscode.window.activeTextEditor?.document.uri.toString()
    });

    statusBar.showSuccess(`${result.stored} memories extracted`);
    
    vscode.window.showInformationMessage(
      `Chat saved! Extracted ${result.stored} long-term memories.`,
      'View in Dashboard'
    ).then(action => {
      if (action === 'View in Dashboard') {
        const appUrl = vscode.workspace.getConfiguration('unimemory').get('appUrl');
        vscode.env.openExternal(vscode.Uri.parse(`${appUrl}/memories`));
      }
    });
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to save chat: ${error.message}`);
    statusBar.setError(error.message);
  }
}

/**
 * Try to extract chat content from the current editor context
 */
async function getChatContent(): Promise<{ messages: ChatMessage[] }> {
  const messages: ChatMessage[] = [];
  
  // Method 1: Check if there's selected text in the editor
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const selectedText = editor.document.getText(editor.selection);
    messages.push(...parseConversation(selectedText));
  }
  
  // Method 2: Check clipboard
  if (messages.length === 0) {
    const clipboardAction = await vscode.window.showQuickPick(
      ['Use text from clipboard', 'Select text in editor', 'Type manually'],
      { placeHolder: 'How would you like to provide the chat content?' }
    );
    
    if (clipboardAction === 'Use text from clipboard') {
      const clipboardText = await vscode.env.clipboard.readText();
      if (clipboardText) {
        messages.push(...parseConversation(clipboardText));
      }
    } else if (clipboardAction === 'Select text in editor') {
      vscode.window.showInformationMessage('Select the chat text and run this command again.');
      return { messages: [] };
    }
  }
  
  return { messages };
}

/**
 * Parse conversation text into structured messages
 */
function parseConversation(text: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = text.split('\n');
  
  let currentRole: 'user' | 'assistant' = 'user';
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Try to detect role changes
    if (trimmedLine.toLowerCase().startsWith('user:') || 
        trimmedLine.toLowerCase().startsWith('me:') ||
        trimmedLine.toLowerCase().startsWith('human:')) {
      if (currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        currentContent = [];
      }
      currentRole = 'user';
      currentContent.push(trimmedLine.replace(/^(user|me|human):\s*/i, ''));
    } else if (trimmedLine.toLowerCase().startsWith('assistant:') ||
               trimmedLine.toLowerCase().startsWith('ai:') ||
               trimmedLine.toLowerCase().startsWith('claude:') ||
               trimmedLine.toLowerCase().startsWith('gpt:') ||
               trimmedLine.toLowerCase().startsWith('cursor:') ||
               trimmedLine.toLowerCase().startsWith('cascade:')) {
      if (currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
        currentContent = [];
      }
      currentRole = 'assistant';
      currentContent.push(trimmedLine.replace(/^(assistant|ai|claude|gpt|cursor|cascade):\s*/i, ''));
    } else if (trimmedLine) {
      currentContent.push(trimmedLine);
    }
  }
  
  // Don't forget the last message
  if (currentContent.length > 0) {
    messages.push({ role: currentRole, content: currentContent.join('\n').trim() });
  }
  
  // If no structure detected, treat the whole text as a single user message
  if (messages.length === 0 && text.trim()) {
    messages.push({ role: 'user', content: text.trim() });
  }
  
  return messages;
}

function detectEditorType(): string {
  const appName = vscode.env.appName.toLowerCase();
  
  if (appName.includes('cursor')) return 'cursor';
  if (appName.includes('windsurf')) return 'windsurf';
  if (appName.includes('antigravity')) return 'antigravity';
  
  return 'vscode';
}
