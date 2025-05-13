# Just Chatting

A real-time chat application built with React, TypeScript, and Cloudflare Workers. Features include real-time messaging, user authentication, and room-based chat functionality.

## Features

- Real-time WebSocket communication
- User authentication with JWT
- Room-based chat functionality
- Message history
- Typing indicators
- Bot protection
- Rate limiting
- Message sanitization
- Responsive UI with Tailwind CSS

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Cloudflare Workers
- **Database**: D1 (Cloudflare)

## Prerequisites

- Node.js >= 18.0.0
- Cloudflare account
- Wrangler CLI

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
4. Update the `.env` file with your Cloudflare credentials

## Development

Start the development server:

```bash
npm run dev
```

Start the worker in development mode:

```bash
npm run worker:dev
```

## Building

Build the application:

```bash
npm run build
```

Build the worker:

```bash
npm run worker:build
```

## Deployment

Deploy the worker to Cloudflare:

```bash
npm run worker:deploy
```

## Project Structure

```
├── app/              # React Router 7 app directory
├── src/
│   ├── components/   # React components
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Utility functions
│   ├── types/        # TypeScript type definitions
│   └── db/           # Database schema and migrations
├── worker/           # Cloudflare Worker code
└── public/           # Static assets
```

## Security Features

- JWT-based authentication
- Message sanitization with DOMPurify and sanitize-html
- Bot detection with isbot
- Rate limiting per IP
- WebSocket connection limits
- Input validation with Zod

## License

MIT
