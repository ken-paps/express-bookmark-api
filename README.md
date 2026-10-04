# Express Bookmark API

A production-style REST API for managing bookmarks, built with **Express**, **Prisma**, **MySQL**, and **JWT authentication**. Includes role-based access control, automated tests, and full auth flow with refresh tokens.

## ✨ Features

- 🔐 **JWT Authentication** — register, login, refresh, logout, logout-all
- 🚫 **Token Blacklisting** — revoked access tokens are rejected
- 📚 **Bookmark CRUD** — pagination, search, tag filtering
- 👤 **Ownership Enforcement** — users only access their own data
- 👑 **Role-Based Access** — admin endpoints for user & content moderation
- ✅ **Automated Tests** — 44 tests with Jest + Supertest
- 🛡️ **Security** — Helmet, CORS, rate limiting, input validation

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| ORM | Prisma |
| Database | MySQL |
| Auth | JWT + bcrypt |
| Validation | express-validator |
| Testing | Jest + Supertest |
| Security | Helmet, CORS, express-rate-limit |

## 📋 Prerequisites

- Node.js 18+
- MySQL 8+ (or XAMPP/WAMP/MAMP)
- phpMyAdmin (optional, for viewing data)

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/ken-paps/express-bookmark-api.git
cd express-bookmark-api
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

### 4. Create the databases

In phpMyAdmin (or MySQL CLI), create:
- `express_api` — for development
- `express_api_test` — for tests

### 5. Run migrations
```bash
npm run prisma:migrate
```

### 6. Seed the admin user
```bash
npm run seed:admin
```

### 7. Start the server
```bash
npm run dev
```

Server runs at `http://localhost:4000`.

## 🧪 Testing

```bash
npm test
```

All tests run against the `express_api_test` database — your dev data is never touched.

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register new user | ❌ |
| POST | `/api/auth/login` | Login, returns tokens | ❌ |
| POST | `/api/auth/refresh` | Refresh access token | ❌ |
| POST | `/api/auth/logout` | Logout (revoke refresh + blacklist access) | ✅ |
| POST | `/api/auth/logout-all` | Logout from all devices | ✅ |
| GET | `/api/auth/me` | Get current user | ✅ |

### Bookmarks
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/bookmarks` | List own bookmarks (paginated) | ✅ |
| GET | `/api/bookmarks/:id` | Get own bookmark | ✅ |
| POST | `/api/bookmarks` | Create bookmark | ✅ |
| PATCH | `/api/bookmarks/:id` | Update own bookmark | ✅ |
| DELETE | `/api/bookmarks/:id` | Delete own bookmark | ✅ |

**Query params for `GET /api/bookmarks`:**
- `?page=1&limit=10` — pagination
- `?search=term` — search title or URL
- `?tag=dev` — filter by tag

### Admin
All admin routes require `role: "admin"`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/users` | List all users |
| GET | `/api/admin/users/:id` | Get a user |
| PATCH | `/api/admin/users/:id/role` | Promote/demote user |
| DELETE | `/api/admin/users/:id` | Delete user |
| GET | `/api/admin/bookmarks` | List all bookmarks |
| DELETE | `/api/admin/bookmarks/:id` | Delete any bookmark |

## 📁 Project Structure

```
express-api/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.js
├── src/
│   ├── config/          # Prisma singleton
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Auth, role checks
│   ├── routes/          # Express routers
│   ├── utils/           # JWT helpers
│   └── validators/      # express-validator rules
├── tests/               # Jest + Supertest
├── .env.example
├── jest.config.js
└── package.json
```

## 🔒 Environment Variables

See `.env.example` for the full list. Key variables:

- `DATABASE_URL` — MySQL connection string (dev)
- `DATABASE_URL_TEST` — MySQL connection string (test)
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — long random strings
- `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` — token lifetimes

## 📝 License

MIT © [Ken Paps](https://github.com/ken-paps)