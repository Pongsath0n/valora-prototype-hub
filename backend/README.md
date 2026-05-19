# Valora Backend

## Run locally

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

## Environment

Copy `.env.example` to `.env` and set values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
