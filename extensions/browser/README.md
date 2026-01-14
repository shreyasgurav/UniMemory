# UniMemory Browser Extension

Chrome/Arc/Brave extension for capturing AI chats and building your personal memory layer.

## Features

- **AI Chat Capture**: Save conversations from ChatGPT, Claude, and Gemini
- **Floating Save Button**: One-click save on any supported AI chat page
- **Auto-save Mode**: Automatically capture chats when you leave the page
- **Platform Controls**: Enable/disable capture per platform
- **Firebase Auth Integration**: Uses your UniMemory account (no separate login)

## Supported Platforms

| Platform | Status |
|----------|--------|
| ChatGPT (chat.openai.com, chatgpt.com) | ✅ Supported |
| Claude (claude.ai) | ✅ Supported |
| Gemini (gemini.google.com) | ✅ Supported |

## Structure

```
extensions/browser/
├── manifest.json              # Extension manifest (MV3)
├── popup.html                 # Popup UI
├── src/
│   ├── background/
│   │   └── index.js          # Service worker (auth, API calls)
│   ├── content/
│   │   ├── chatgpt.js        # ChatGPT chat extraction
│   │   ├── claude.js         # Claude chat extraction
│   │   └── gemini.js         # Gemini chat extraction
│   ├── popup/
│   │   └── index.js          # Popup logic
│   └── styles/
│       ├── floating-button.css  # Floating button styles
│       └── popup.css         # Popup styles
└── icons/                    # Extension icons
```

## Development

### Load Unpacked Extension

1. Open Chrome/Arc/Brave
2. Go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `extensions/browser` folder

### Testing

1. Log in to [app.unimemory.app](https://app.unimemory.app)
2. Visit ChatGPT, Claude, or Gemini
3. Click the floating "Save to UniMemory" button
4. Check your memories at [app.unimemory.app/memories](https://app.unimemory.app/memories)

## Auth Flow

```
User logs into app.unimemory.app (Firebase)
        ↓
Extension calls GET /consumer/auth/session
        ↓
Backend issues short-lived consumer session token (JWT)
        ↓
Extension stores token locally
        ↓
Extension uses token for ingest API calls
```

**Key Points:**
- NO API keys in extension
- NO Firebase tokens stored long-term
- Session tokens expire in 1 hour
- Refresh happens automatically

## API Integration

- `GET /api/v1/consumer/auth/session` - Get session token
- `POST /api/v1/ingest/chat` - Save chat conversation

## Adding Icons

Add these files to the `icons/` folder:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

Use a dark background with the UniMemory logo.
