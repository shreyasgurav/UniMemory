/**
 * Save Project Context Command
 * Store stable project-level decisions and context
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from '../api/client';
import { StatusBarManager } from '../ui/statusBar';

export async function saveProjectContextCommand(
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

  // Get workspace info
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const projectName = workspaceFolders?.[0]?.name || 'Unnamed Project';

  // Show quick pick for context type
  const contextType = await vscode.window.showQuickPick([
    { label: '🏗️ Tech Stack', description: 'Technologies, frameworks, and tools used', value: 'tech_stack' },
    { label: '📐 Architecture', description: 'System design and architecture decisions', value: 'architecture' },
    { label: '🚫 Constraints', description: 'Limitations, requirements, and boundaries', value: 'constraints' },
    { label: '🎯 Goals', description: 'Project objectives and milestones', value: 'goals' },
    { label: '📝 Design Philosophy', description: 'Coding style and design principles', value: 'philosophy' },
    { label: '📋 Custom', description: 'Enter custom context', value: 'custom' }
  ], {
    placeHolder: 'What type of project context do you want to save?'
  });

  if (!contextType) {
    return;
  }

  // Get prompts based on context type
  let prompt = '';
  let placeholder = '';

  switch (contextType.value) {
    case 'tech_stack':
      prompt = 'Describe your tech stack';
      placeholder = 'e.g., FastAPI + PostgreSQL + React, using Tailwind for styling';
      break;
    case 'architecture':
      prompt = 'Describe your architecture decisions';
      placeholder = 'e.g., Monolithic backend, separate consumer and B2B APIs';
      break;
    case 'constraints':
      prompt = 'Describe project constraints';
      placeholder = 'e.g., Must support multi-tenant, no Redux, minimal abstractions';
      break;
    case 'goals':
      prompt = 'Describe project goals';
      placeholder = 'e.g., Ship MVP in 2 weeks, focus on core memory features';
      break;
    case 'philosophy':
      prompt = 'Describe design philosophy';
      placeholder = 'e.g., Prefer composition over inheritance, avoid heavy abstractions';
      break;
    case 'custom':
      prompt = 'Enter your project context';
      placeholder = 'Describe any important project context...';
      break;
  }

  // Open multi-line input editor for longer content
  const document = await vscode.workspace.openTextDocument({
    content: `# ${contextType.label} for ${projectName}\n\n`,
    language: 'markdown'
  });
  
  const editor = await vscode.window.showTextDocument(document);
  
  // Show instructions
  const saveAction = await vscode.window.showInformationMessage(
    `Write your ${contextType.label.toLowerCase()} context, then click Save when done.`,
    'Save to UniMemory',
    'Cancel'
  );

  if (saveAction !== 'Save to UniMemory') {
    return;
  }

  const content = editor.document.getText().trim();
  
  if (!content || content.length < 10) {
    vscode.window.showWarningMessage('Please enter more context content before saving');
    return;
  }

  statusBar.setLoading('Saving project context...');

  try {
    const result = await client.ingestDocument(content, {
      type: 'project',
      title: `${contextType.label} - ${projectName}`,
      projectName
    });

    statusBar.showSuccess(`${result.stored} memories extracted`);
    
    vscode.window.showInformationMessage(
      `Project context saved! Extracted ${result.stored} long-term memories.`
    );

    // Close the temp document
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to save project context: ${error.message}`);
    statusBar.setError(error.message);
  }
}
