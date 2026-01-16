/**
 * Save Memory Command
 * Save selected text or input as an atomic memory
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from '../api/client';
import { StatusBarManager } from '../ui/statusBar';

export async function saveMemoryCommand(
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

  const editor = vscode.window.activeTextEditor;
  let content = '';

  // Get content from selection or prompt
  if (editor && !editor.selection.isEmpty) {
    content = editor.document.getText(editor.selection);
  } else {
    content = await vscode.window.showInputBox({
      prompt: 'Enter memory content',
      placeHolder: 'e.g., "Decided to use FastAPI for the backend"',
      validateInput: (value) => {
        if (!value || value.trim().length < 5) {
          return 'Memory content must be at least 5 characters';
        }
        return null;
      }
    }) || '';
  }

  if (!content.trim()) {
    return;
  }

  // Optional: Ask for tags
  const tagsInput = await vscode.window.showInputBox({
    prompt: 'Add tags (optional, comma-separated)',
    placeHolder: 'e.g., decision, architecture, preference'
  });

  const tags = tagsInput 
    ? tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0)
    : [];

  // Detect app context
  const appId = detectEditorType();

  statusBar.setLoading('Saving memory...');

  try {
    const memory = await client.createMemory(content.trim(), { tags, appId });
    
    statusBar.showSuccess('Memory saved');
    vscode.window.showInformationMessage(
      `Memory saved: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to save memory: ${error.message}`);
    statusBar.setError(error.message);
  }
}

/**
 * Detect the editor type (VS Code, Cursor, Windsurf, etc.)
 */
function detectEditorType(): string {
  const appName = vscode.env.appName.toLowerCase();
  
  if (appName.includes('cursor')) {
    return 'cursor';
  }
  if (appName.includes('windsurf')) {
    return 'windsurf';
  }
  if (appName.includes('antigravity')) {
    return 'antigravity';
  }
  
  return 'vscode';
}
