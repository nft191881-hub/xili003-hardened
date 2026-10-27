# Hardened xili003

This project is a security-focused replacement for the original xili003 application. The goal is to reduce the most critical issues discovered in the original codebase:

- enforce SSL certificate validation for database connections
- require environment variables before startup
- add Helmet security headers
- add API rate limits
- sanitize Telegram notification payloads
- restrict user input lengths and disallowed characters
- separate the core auth, product, chat, and order flows into a clearer structure
- keep a minimal but functional backend for local testing and production deployment

## Setup

1. Install dependencies:
   npm install

2. Create a local environment file:
   cp .env.example .env

3. Fill in your real PostgreSQL and JWT values.

4. Start the service:
   npm start

## Endpoints

- GET /health
- POST /api/register
- POST /api/login
- GET /api/me
- GET /api/categories
- GET /api/products
- GET /api/products/:id
- POST /api/products
- POST /api/orders
- GET /api/orders
- POST /api/chat
- GET /api/chat
- GET /api/admin/stats (admin/owner only)

## Notes

This is intentionally a hardened replacement, not a full reproduction of the original codebase. If you want to fully port the original feature set, the next step is to split the remaining modules into separate controllers, schemas, and services.
