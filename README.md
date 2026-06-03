# Futures Desk

Binance USDT-M futures trading with EMA + RSI signals. Connect your own API keys in the browser — no keys stored in deployment env.

## Quick start

```bash
npm install
cp .env.example .env.local
# Set SESSION_SECRET to a random string of at least 32 characters
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect API**, and enter your Binance demo or live futures keys.

## Environment

| Variable | Description |
|----------|-------------|
| `SESSION_SECRET` | Required. Encrypts API keys in the session cookie (32+ chars) |

Binance API keys are **not** set via env — users connect through the UI.

## Deploy (Vercel)

1. Set `SESSION_SECRET` in project environment variables
2. Deploy — each user connects their own Binance keys via the site

## Stack

- Next.js 15 + TypeScript + Tailwind
- ccxt (Binance USDT-M)
- iron-session (encrypted cookie)

## Disclaimer

Live mode uses real funds. Test on demo first.
