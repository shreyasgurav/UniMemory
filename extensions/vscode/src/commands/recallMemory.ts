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
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showWarningMessage('No active editor found');
    return;
  }

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

  // Get query text: selection or current line
  let query = '';
  const selection = editor.selection;
  
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
    return;
  }

  // Show loading state
  statusBar.setLoading('Searching memories...');

  try {
    const maxMemories = vscode.workspace.getConfiguration('unimemory').get<number>('maxMemories') || 5;
    const result = await client.searchMemories(query, maxMemories);
    
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
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to recall memories: ${error.message}`);
    statusBar.setError(error.message);
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
