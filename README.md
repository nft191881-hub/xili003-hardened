# Hardened xili003

This project is a security-focused replacement for the original xili003 application, built for a clean Render deployment setup.

## Features
- user registration and login
- JWT auth
- category listing and product catalog
- product publishing
- order creation and confirmation
- chat messaging
- admin stats and user listing
- hardened startup checks and rate limiting

## Setup

1. Install dependencies
   npm install

2. Create environment file
   cp .env.example .env

3. Fill in your environment values
   - DATABASE_URL
   - JWT_SECRET
   - PORT

4. Start the app
   npm start

5. Health check
   curl http://localhost:3000/health

## Render deployment

Set these environment variables in Render:
- DATABASE_URL
- JWT_SECRET
- PORT=3000

Build command:
- npm install

Start command:
- npm start

## Notes
This is a hardened, modular replacement intended to be cleaner and safer than the original monolithic server.
