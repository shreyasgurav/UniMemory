/**
 * UniMemory Authentication Manager
 * Handles OAuth flow via browser and local server
 */

import * as vscode from 'vscode';
import * as http from 'http';
import { UniMemoryClient } from '../api/client';

export class AuthManager {
  private client: UniMemoryClient;
  private server: http.Server | null = null;

  constructor(client: UniMemoryClient) {
    this.client = client;
  }

  /**
   * Start login flow - opens browser and waits for callback
   */
  async login(): Promise<boolean> {
    return new Promise(async (resolve) => {
      // Start local server to receive auth callback
      const port = await this.startCallbackServer(resolve);
      
      if (!port) {
        vscode.window.showErrorMessage('Failed to start auth server');
        resolve(false);
        return;
      }

      // Build login URL with callback
      const loginUrl = `${this.client.getLoginUrl()}&callback=http://localhost:${port}/callback`;
      
      // Open browser for login
      vscode.env.openExternal(vscode.Uri.parse(loginUrl));
      
      vscode.window.showInformationMessage(
        'Complete login in your browser. This window will update when done.',
        'Cancel'
      ).then(selection => {
        if (selection === 'Cancel') {
          this.stopCallbackServer();
          resolve(false);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        this.stopCallbackServer();
        resolve(false);
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Start local HTTP server to receive auth callback
   */
  private startCallbackServer(resolve: (value: boolean) => void): Promise<number | null> {
    return new Promise((portResolve) => {
      this.server = http.createServer(async (req, res) => {
        if (!req.url?.startsWith('/callback')) {
          res.writeHead(404);
          res.end();
          return;
        }

        try {
          const url = new URL(req.url, `http://localhost`);
          const token = url.searchParams.get('token');
          const userJson = url.searchParams.get('user');
          const expiresIn = url.searchParams.get('expires_in');

          if (token && userJson && expiresIn) {
            const user = JSON.parse(decodeURIComponent(userJson));
            
            await this.client.setSession({
              session_token: token,
              user,
              expires_in: parseInt(expiresIn, 10)
            });

            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>UniMemory - Connected</title>
                  <style>
                    body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
                    .container { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                    h1 { color: #1a1a1a; margin-bottom: 8px; }
                    p { color: #666; }
                    .check { font-size: 48px; margin-bottom: 16px; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="check">✓</div>
                    <h1>Connected to UniMemory!</h1>
                    <p>You can close this tab and return to your editor.</p>
                  </div>
                </body>
              </html>
            `);

            this.stopCallbackServer();
            resolve(true);
          } else {
            throw new Error('Missing auth parameters');
          }
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>UniMemory - Error</title></head>
              <body>
                <h1>Authentication Failed</h1>
                <p>Please try again from your editor.</p>
              </body>
            </html>
          `);
          this.stopCallbackServer();
          resolve(false);
        }
      });

      // Try to find an available port
      this.server.listen(0, () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          portResolve(address.port);
        } else {
          portResolve(null);
        }
      });

      this.server.on('error', () => {
        portResolve(null);
      });
    });
  }

  /**
   * Stop the callback server
   */
  private stopCallbackServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Logout - clear session
   */
  async logout(): Promise<void> {
    await this.client.clearSession();
    vscode.window.showInformationMessage('Logged out of UniMemory');
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    return this.client.isAuthenticated();
  }

  /**
   * Get current user info
   */
  async getCurrentUser(): Promise<{ email: string; name?: string } | null> {
    const session = await this.client.getSession();
    return session?.user || null;
  }
}
