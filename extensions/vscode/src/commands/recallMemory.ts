/**
 * Memory Recall Command
 * Cmd+Shift+M: Search memories and inject context into editor
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from '../api/client';
import { StatusBarManager } from '../ui/statusBar';

export async function recallMemoryCommand(
  client: UniMemoryClient,
  statusBar: StatusBarManager
): Promise<void> {
  console.log('[UniMemory] recallMemoryCommand triggered');
  
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    console.log('[UniMemory] No active editor found');
    vscode.window.showWarningMessage('No active editor found');
    return;
  }
  
  console.log('[UniMemory] Active editor found:', editor.document.fileName);

  // Check authentication
  const isAuth = await client.isAuthenticated();
  console.log('[UniMemory] Authentication status:', isAuth);
  
  if (!isAuth) {
    console.log('[UniMemory] Not authenticated, prompting login');
    const action = await vscode.window.showWarningMessage(
      'Please login to UniMemory first',
      'Login'
    );
    if (action === 'Login') {
      vscode.commands.executeCommand('unimemory.login');
    }
    return;
  }

  // Get query text: selection or current line
  let query = '';
  const selection = editor.selection;
  console.log('[UniMemory] Selection:', selection.isEmpty ? 'empty' : 'has text');
  
  if (!selection.isEmpty) {
    query = editor.document.getText(selection);
  } else {
    // Use current line as query
    const currentLine = editor.document.lineAt(selection.active.line);
    query = currentLine.text.trim();
  }

  if (!query) {
    // Prompt user for query
    query = await vscode.window.showInputBox({
      prompt: 'Enter search query for memories',
      placeHolder: 'What are you looking for?'
    }) || '';
  }

  if (!query) {
    console.log('[UniMemory] No query provided, aborting');
    return;
  }

  console.log('[UniMemory] Query:', query);

  // Show loading state
  statusBar.setLoading('Searching memories...');

  try {
    const maxMemories = vscode.workspace.getConfiguration('unimemory').get<number>('maxMemories') || 5;
    console.log('[UniMemory] Calling API to search memories, limit:', maxMemories);
    const result = await client.searchMemories(query, maxMemories);
    console.log('[UniMemory] API response:', result);
    
    if (!result.results || result.results.length === 0) {
      vscode.window.showInformationMessage('No related memories found');
      statusBar.setReady();
      return;
    }

    // Format memories for injection
    const memoriesText = formatMemoriesForInjection(result.results);
    
    // Show preview and ask for confirmation
    const action = await vscode.window.showInformationMessage(
      `Found ${result.results.length} related memories`,
      'Insert Above Cursor',
      'Insert as Comment',
      'Copy to Clipboard',
      'Preview'
    );

    if (action === 'Insert Above Cursor') {
      await insertMemoriesAboveCursor(editor, memoriesText);
      statusBar.showSuccess(`${result.results.length} memories recalled`);
    } else if (action === 'Insert as Comment') {
      const languageId = editor.document.languageId;
      const commentedText = wrapAsComment(memoriesText, languageId);
      await insertMemoriesAboveCursor(editor, commentedText);
      statusBar.showSuccess(`${result.results.length} memories recalled`);
    } else if (action === 'Copy to Clipboard') {
      await vscode.env.clipboard.writeText(memoriesText);
      vscode.window.showInformationMessage('Memories copied to clipboard');
      statusBar.setReady();
    } else if (action === 'Preview') {
      // Show in output channel
      const outputChannel = vscode.window.createOutputChannel('UniMemory');
      outputChannel.clear();
      outputChannel.appendLine('=== UniMemory Context ===\n');
      result.results.forEach((m, i) => {
        outputChannel.appendLine(`${i + 1}. ${m.content}`);
        if (m.tags?.length) {
          outputChannel.appendLine(`   Tags: ${m.tags.join(', ')}`);
        }
        outputChannel.appendLine('');
      });
      outputChannel.show();
      statusBar.setReady();
    } else {
      statusBar.setReady();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to recall memories';
    console.log('[UniMemory] Error recalling memories:', error);
    
    // If session expired, offer to login
    if (message.includes('Session expired') || message.includes('Not authenticated')) {
      const action = await vscode.window.showErrorMessage(
        'Session expired. Please login to UniMemory.',
        'Login'
      );
      if (action === 'Login') {
        vscode.commands.executeCommand('unimemory.login');
      }
    } else {
      vscode.window.showErrorMessage(`Failed to recall memories: ${message}`);
    }
    
    statusBar.setError('Recall failed');
    statusBar.setAuthenticated(false);
  }
}

function formatMemoriesForInjection(memories: Array<{ content: string; tags?: string[] }>): string {
  const lines = [
    '--- UniMemory Context ---',
    ...memories.map(m => `• ${m.content}`),
    '---'
  ];
  return lines.join('\n');
}

function wrapAsComment(text: string, languageId: string): string {
  const lines = text.split('\n');
  
  // Language-specific comment styles
  const lineCommentLangs: Record<string, string> = {
    javascript: '//',
    typescript: '//',
    python: '#',
    ruby: '#',
    go: '//',
    rust: '//',
    java: '//',
    c: '//',
    cpp: '//',
    csharp: '//',
    sql: '--',
    yaml: '#',
  };

  const blockCommentLangs: Record<string, { start: string; end: string }> = {
    html: { start: '<!--', end: '-->' },
    css: { start: '/*', end: '*/' },
    markdown: { start: '<!--', end: '-->' },
  };

  const lineComment = lineCommentLangs[languageId];
  const blockComment = blockCommentLangs[languageId];

  if (lineComment) {
    return lines.map(line => `${lineComment} ${line}`).join('\n');
  } else if (blockComment) {
    return `${blockComment.start}\n${text}\n${blockComment.end}`;
  }
  
  // Default to // style
  return lines.map(line => `// ${line}`).join('\n');
}

async function insertMemoriesAboveCursor(
  editor: vscode.TextEditor,
  text: string
): Promise<void> {
  const position = editor.selection.active;
  const lineStart = new vscode.Position(position.line, 0);
  
  await editor.edit(editBuilder => {
    editBuilder.insert(lineStart, text + '\n\n');
  });
}
