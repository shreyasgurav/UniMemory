/**
 * UniMemory VS Code Extension
 * Capture long-term memories from AI-assisted development
 * Works with Cursor, Windsurf, VS Code, and other VS Code-based editors
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from './api/client';
import { AuthManager } from './auth/authManager';
import { StatusBarManager } from './ui/statusBar';
import { ActivityPanel } from './ui/activityPanel';
import { saveMemoryCommand } from './commands/saveMemory';
import { saveChatCommand } from './commands/saveChat';
import { saveProjectContextCommand } from './commands/saveProjectContext';

let client: UniMemoryClient;
let authManager: AuthManager;
let statusBar: StatusBarManager;
let activityPanel: ActivityPanel;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[UniMemory] Extension activating...');

  // Initialize components
  client = new UniMemoryClient(context);
  authManager = new AuthManager(client);
  statusBar = new StatusBarManager();
  activityPanel = new ActivityPanel();

  // Check initial auth status
  const isAuthenticated = await client.isAuthenticated();
  statusBar.setAuthenticated(isAuthenticated);

  if (isAuthenticated) {
    const user = await client.getSession();
    console.log('[UniMemory] Logged in as:', user?.user.email);
  }

  // Register commands
  const commands = [
    // Save Memory - Save selection as atomic memory (Cmd+Shift+S)
    vscode.commands.registerCommand('unimemory.saveMemory', async () => {
      await saveMemoryCommand(client, statusBar);
    }),

    // Save Chat - Explicitly save a conversation
    vscode.commands.registerCommand('unimemory.saveChat', async () => {
      await saveChatCommand(client, statusBar);
    }),

    // Save Project Context - Store project-level decisions
    vscode.commands.registerCommand('unimemory.saveProjectContext', async () => {
      await saveProjectContextCommand(client, statusBar);
    }),

    // Login
    vscode.commands.registerCommand('unimemory.login', async () => {
      statusBar.setLoading('Logging in...');
      const success = await authManager.login();
      
      if (success) {
        statusBar.setAuthenticated(true);
        statusBar.showSuccess('Logged in');
        vscode.window.showInformationMessage('Successfully logged in to UniMemory!');
      } else {
        statusBar.setAuthenticated(false);
        statusBar.setReady();
      }
    }),

    // Logout
    vscode.commands.registerCommand('unimemory.logout', async () => {
      await authManager.logout();
      statusBar.setAuthenticated(false);
    }),

    // Show Activity
    vscode.commands.registerCommand('unimemory.showActivity', () => {
      activityPanel.show();
    })
  ];

  // Register all commands
  commands.forEach(cmd => context.subscriptions.push(cmd));

  // Register status bar
  context.subscriptions.push({
    dispose: () => {
      statusBar.dispose();
      activityPanel.dispose();
    }
  });

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('unimemory.showStatusBar')) {
        statusBar.show();
      }
    })
  );

  // Show welcome message on first install
  const hasShownWelcome = context.globalState.get<boolean>('unimemory.hasShownWelcome');
  if (!hasShownWelcome) {
    const action = await vscode.window.showInformationMessage(
      'UniMemory installed! Login to start capturing memories from your development work.',
      'Login Now',
      'Later'
    );
    
    if (action === 'Login Now') {
      vscode.commands.executeCommand('unimemory.login');
    }
    
    await context.globalState.update('unimemory.hasShownWelcome', true);
  }

  console.log('[UniMemory] Extension activated');
}

export function deactivate() {
  console.log('[UniMemory] Extension deactivated');
}
