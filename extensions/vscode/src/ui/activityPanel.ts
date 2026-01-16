/**
 * Activity Panel
 * Shows recent UniMemory activity and provides quick actions
 */

import * as vscode from 'vscode';
import { UniMemoryClient } from '../api/client';

interface ActivityItem {
  type: 'recall' | 'save' | 'chat' | 'project';
  message: string;
  timestamp: Date;
  count?: number;
}

export class ActivityPanel {
  private outputChannel: vscode.OutputChannel;
  private activities: ActivityItem[] = [];

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('UniMemory Activity');
  }

  /**
   * Log a recall activity
   */
  logRecall(count: number, query: string): void {
    this.addActivity({
      type: 'recall',
      message: `Recalled ${count} memories for: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`,
      timestamp: new Date(),
      count
    });
  }

  /**
   * Log a save activity
   */
  logSave(content: string): void {
    this.addActivity({
      type: 'save',
      message: `Saved memory: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
      timestamp: new Date()
    });
  }

  /**
   * Log a chat save activity
   */
  logChatSave(memoriesExtracted: number, title: string): void {
    this.addActivity({
      type: 'chat',
      message: `Saved chat "${title}" - extracted ${memoriesExtracted} memories`,
      timestamp: new Date(),
      count: memoriesExtracted
    });
  }

  /**
   * Log a project context save activity
   */
  logProjectContext(memoriesExtracted: number, contextType: string): void {
    this.addActivity({
      type: 'project',
      message: `Saved ${contextType} - extracted ${memoriesExtracted} memories`,
      timestamp: new Date(),
      count: memoriesExtracted
    });
  }

  /**
   * Add activity to log
   */
  private addActivity(activity: ActivityItem): void {
    this.activities.unshift(activity);
    
    // Keep only last 50 activities
    if (this.activities.length > 50) {
      this.activities = this.activities.slice(0, 50);
    }

    // Update output channel
    this.updateOutputChannel();
  }

  /**
   * Update the output channel with activities
   */
  private updateOutputChannel(): void {
    this.outputChannel.clear();
    this.outputChannel.appendLine('=== UniMemory Activity ===\n');

    if (this.activities.length === 0) {
      this.outputChannel.appendLine('No recent activity.');
      this.outputChannel.appendLine('\nTry:');
      this.outputChannel.appendLine('  - Cmd+Shift+M to recall memories');
      this.outputChannel.appendLine('  - Select text and run "UniMemory: Save Selection"');
      this.outputChannel.appendLine('  - Run "UniMemory: Save Chat" to save a conversation');
      return;
    }

    for (const activity of this.activities) {
      const time = activity.timestamp.toLocaleTimeString();
      const icon = this.getActivityIcon(activity.type);
      this.outputChannel.appendLine(`[${time}] ${icon} ${activity.message}`);
    }

    this.outputChannel.appendLine('\n---');
    this.outputChannel.appendLine('Keyboard shortcuts:');
    this.outputChannel.appendLine('  Cmd+Shift+M - Recall memories');
    this.outputChannel.appendLine('  Cmd+Shift+S - Save selection as memory');
  }

  /**
   * Get icon for activity type
   */
  private getActivityIcon(type: string): string {
    switch (type) {
      case 'recall': return '🔍';
      case 'save': return '💾';
      case 'chat': return '💬';
      case 'project': return '📁';
      default: return '•';
    }
  }

  /**
   * Show the activity panel
   */
  show(): void {
    this.updateOutputChannel();
    this.outputChannel.show(true);
  }

  /**
   * Dispose the output channel
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}
