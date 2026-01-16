# UniMemory VS Code Extension

**Long-term memory capture + recall for AI-assisted development.**

Works with **Cursor**, **Windsurf**, **VS Code**, and other VS Code-based editors.

## 🧠 Core Features

### 1. Memory Recall (Cmd+Shift+M)
Inject relevant long-term memories into your current context.

- Press `Cmd+Shift+M` (Mac) or `Ctrl+Shift+M` (Windows/Linux)
- Uses current selection or cursor line as search query
- Retrieves relevant memories from your UniMemory
- Insert above cursor, as comment, or copy to clipboard

### 2. Save Memory (Cmd+Shift+S)
Save selected text as an atomic memory.

- Select text and press `Cmd+Shift+S`
- Or right-click → "UniMemory: Save Selection as Memory"
- Add optional tags for organization

### 3. Save Chat
Explicitly save a conversation to extract long-term memories.

- Command Palette → "UniMemory: Save Chat to Memory"
- Paste chat content or use clipboard
- Backend extracts atomic memories automatically

### 4. Save Project Context
Store stable project-level decisions (tech stack, architecture, constraints).

- Command Palette → "UniMemory: Save Project Context"
- Choose context type: Tech Stack, Architecture, Constraints, Goals, etc.
- Saved rarely, used frequently in recall

### 5. Activity Visibility
See what UniMemory is doing via status bar and activity panel.

- Status bar shows connection status
- Activity panel shows recent operations
- Toast notifications for actions

## 🚀 Getting Started

### Installation

1. **From VS Code Marketplace** (coming soon)
2. **Manual Installation:**
   ```bash
   cd extensions/vscode
   npm install
   npm run compile
   ```
   Then press F5 to launch Extension Development Host.

### Login

1. Click the UniMemory status bar item, or
2. Command Palette → "UniMemory: Login"
3. Complete login in your browser
4. You're connected!

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+M` | Recall memories |
| `Cmd+Shift+S` | Save selection as memory |

## 🎯 What Counts as a Memory

UniMemory stores **atomic, long-term facts** only:

| Type | Example |
|------|---------|
| Decision | "Chose JWT over sessions" |
| Preference | "User prefers TypeScript strict mode" |
| Constraint | "Must support multi-tenant" |
| Pattern | "Avoid heavy abstractions" |
| Goal | "Ship MVP in 2 weeks" |

**One idea = one memory.** No paragraphs, no transcripts.

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `unimemory.apiUrl` | Railway API | UniMemory API endpoint |
| `unimemory.appUrl` | Vercel App | UniMemory web app URL |
| `unimemory.maxMemories` | 5 | Max memories to recall |
| `unimemory.showStatusBar` | true | Show status bar item |

## 🏗️ Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Package extension
npm run package
```

Press **F5** to launch the Extension Development Host.

## 📁 Project Structure

```
extensions/vscode/
├── src/
│   ├── extension.ts          # Main entry point
│   ├── api/
│   │   └── client.ts         # UniMemory API client
│   ├── auth/
│   │   └── authManager.ts    # OAuth flow
│   ├── commands/
│   │   ├── recallMemory.ts   # Cmd+Shift+M
│   │   ├── saveMemory.ts     # Save selection
│   │   ├── saveChat.ts       # Save conversation
│   │   └── saveProjectContext.ts
│   └── ui/
│       ├── statusBar.ts      # Status bar
│       └── activityPanel.ts  # Activity log
├── package.json
├── tsconfig.json
└── README.md
```

## 🔒 Privacy

- No auto-saving without user intent
- No code storage by default
- No background ingestion
- All actions are explicit and visible

## 📄 License

MIT
