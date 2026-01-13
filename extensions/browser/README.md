# UniMemory Browser Extension

Chrome/Arc/Brave extension for capturing web content.

## Features
- Auto-capture browsing context
- Manual memory creation
- Quick search
- Privacy controls

## Structure
- `/src/content` - Content scripts (page context)
- `/src/background` - Service worker (API calls)
- `/src/popup` - Extension popup UI

## Development
```bash
npm install
npm run build
```

Load unpacked extension from `dist/` folder.

## API Integration
- Authenticates via OAuth/token
- Calls `/api/v1/ingest/*` endpoints
- Never accesses DB directly
