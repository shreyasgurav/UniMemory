# UniMemory VS Code Extension

Capture code context and development conversations.

## Features
- Capture code selections
- Auto-capture git commits
- Sync with UniMemory API
- Search memories from command palette

## Development
```bash
npm install
npm run compile
```

Press F5 to launch extension development host.

## API Integration
- Authenticates via token
- Calls `/api/v1/ingest/text` and `/api/v1/search`
- Respects user privacy settings
