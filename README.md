# Hardened xili003

This project is a security-focused replacement for the original xili003 application.

## What was fixed
- enforced environment variable validation
- removed insecure TLS certificate bypass
- added Helmet security headers
- added request rate limiting
- normalized user input handling
- separated auth, product, order, chat, and admin routes
- set a safer database bootstrap strategy

## Setup
1. npm install
2. cp .env.example .env
3. fill in DATABASE_URL and JWT_SECRET
4. npm start

## Basic endpoints
- GET /health
- POST /api/register
- POST /api/login
- GET /api/me
- GET /api/categories
- GET /api/products
- POST /api/products
- POST /api/orders
- GET /api/orders
- POST /api/chat
- GET /api/chat
- GET /api/admin/stats

## Notes
This is a hardened minimal replacement, not a direct clone of the original system. It is intentionally smaller and safer for production deployment and future module-based expansion.
