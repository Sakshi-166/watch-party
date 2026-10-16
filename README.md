# Watch Party

A real-time movie watch-party application where friends can join rooms,
synchronize playback, chat, react, discover movies, and create shared playlists.

## Features

- Create and join rooms using room codes
- Shared playback controls
- Live chat and emoji reactions
- Movie search and category filters
- Shared playlists
- Group polls
- Host transfer
- Participant presence and reconnection support
- Playback drift correction

## Technology

- React
- Vite
- Supabase
- JavaScript
- Fuse.js
- CSS

## Development

Install Node.js, then run:

npm install
npm run dev

## Production build

npm run build

## Configuration

Copy .env.example to .env and configure the Supabase project
before using the shared-room features.

## Notes

The application requires a configured backend for real multi-user rooms.
The included sample video is for demonstrating playback controls, not a
catalog of commercial movies.

Performance targets must be measured under documented test conditions.
