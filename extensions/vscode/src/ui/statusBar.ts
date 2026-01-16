/**
 * Status Bar Manager
 * Shows UniMemory status and activity in VS Code status bar
 */

import * as vscode from 'vscode';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private isAuthenticated: boolean = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'unimemory.showActivity';
    this.setReady();
  }

  /**
   * Update authentication status
   */
  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
    this.setReady();
  }

  /**
   * Set ready state
   */
  setReady(): void {
    if (!this.isAuthenticated) {
      this.statusBarItem.text = '$(brain) UniMemory';
      this.statusBarItem.tooltip = 'Click to login to UniMemory';
      this.statusBarItem.command = 'unimemory.login';
      this.statusBarItem.backgroundColor = undefined;
    } else {
      this.statusBarItem.text = '$(brain) UniMemory';
      this.statusBarItem.tooltip = 'UniMemory: Ready (Cmd+Shift+M to recall memories)';
      this.statusBarItem.command = 'unimemory.showActivity';
      this.statusBarItem.backgroundColor = undefined;
    }
    this.show();
  }

  /**
   * Set loading state
   */
  setLoading(message: string): void {
    this.statusBarItem.text = '$(sync~spin) ' + message;
    this.statusBarItem.tooltip = message;
    this.statusBarItem.backgroundColor = undefined;
  }

  /**
   * Show success message temporarily
   */
  showSuccess(message: string): void {
    this.statusBarItem.text = '$(check) ' + message;
    this.statusBarItem.tooltip = message;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );

    // Reset after 3 seconds
    setTimeout(() => {
      this.setReady();
    }, 3000);
  }

  /**
   * Show error state
   */
  setError(message: string): void {
    this.statusBarItem.text = '$(error) UniMemory Error';
    this.statusBarItem.tooltip = message;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.errorBackground'
    );

    // Reset after 5 seconds
    setTimeout(() => {
      this.setReady();
    }, 5000);
  }

  /**
   * Show the status bar item
   */
  show(): void {
    const showStatusBar = vscode.workspace
      .getConfiguration('unimemory')
      .get<boolean>('showStatusBar', true);
    
    if (showStatusBar) {
      this.statusBarItem.show();
    } else {
      this.statusBarItem.hide();
    }
  }

  /**
   * Hide the status bar item
   */
  hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Dispose the status bar item
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
