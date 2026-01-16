# UniMemory VS Code Extension

**Capture long-term memories from AI-assisted development.**

Works with **Cursor**, **Windsurf**, **VS Code**, and other VS Code-based editors.

> **Note:** This extension is for **memory capture only**. For memory recall, use the UniMemory MCP server or Chrome extension.

## 🧠 Core Features

### 1. Save Selection (Cmd+Shift+S) — Most Used
Save selected code or text as an atomic memory.

- Select text and press `Cmd+Shift+S`
- Or right-click → "UniMemory: Save Selection as Memory"
- Add optional tags for organization
- Includes file path, language, and repo context

**Best for:**
- Important code patterns
- Useful comments and explanations
- Configuration snippets

### 2. Save Project Context — Most Important
Store stable project-level decisions (architecture, constraints, tradeoffs).

- Command Palette → "UniMemory: Save Project Context"
- Choose context type: Tech Stack, Architecture, Constraints, Goals
- Describe the decision or context
- Optionally attach selected code

**Best for:**
- "We chose X over Y because..."
- "This system cannot use Redis due to..."
- "Architecture follows hexagonal pattern"

### 3. Save Chat — Explicit Only
Explicitly save a conversation to extract long-term memories.

- Command Palette → "UniMemory: Save Chat to Memory"
- Paste chat content or use clipboard
- Backend extracts atomic memories automatically

**Best for:**
- Important discussions with AI agents
- Debugging sessions worth remembering
- Decision-making conversations

### 4. Activity Visibility
See what UniMemory is doing via status bar and activity panel.

- Status bar shows connection status
- Activity panel shows recent save operations
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
│   │   ├── saveMemory.ts     # Save selection (Cmd+Shift+S)
│   │   ├── saveChat.ts       # Save conversation
│   │   └── saveProjectContext.ts
│   └── ui/
│       ├── statusBar.ts      # Status bar
│       └── activityPanel.ts  # Activity log
├── package.json
├── tsconfig.json
└── README.md
```

## 🔒 Privacy & Philosophy

- **No auto-saving** — You decide what's worth remembering
- **No background ingestion** — Only explicit saves
- **No code storage by default** — Just the context you provide
- **All actions visible** — Activity panel shows everything

## 🔌 Where Recall Happens

This extension is for **capture**. Recall happens via:

| Layer | Use Case |
|-------|----------|
| **MCP Server** | Agent-to-memory recall in Cursor/Windsurf |
| **Chrome Extension** | Direct injection into ChatGPT/Claude/Gemini |
| **Web Dashboard** | Browse and search all memories |

This separation keeps the extension simple and the signal quality high.

## 📄 License

MIT
