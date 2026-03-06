from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import httpx
import os
import time
import asyncio
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Token store (in-memory) ───────────────────────────────────────────────────
token_store = {
    "access_token": os.getenv("ZOHO_ACCESS_TOKEN", ""),
    "expires_at": 0,
}

ZOHO_CLIENT_ID     = os.getenv("ZOHO_CLIENT_ID")
ZOHO_CLIENT_SECRET = os.getenv("ZOHO_CLIENT_SECRET")
ZOHO_REFRESH_TOKEN = os.getenv("ZOHO_REFRESH_TOKEN")
ZOHO_SHEET_ID      = os.getenv("ZOHO_SHEET_ID")
ZOHO_TOKEN_URL     = "https://accounts.zoho.in/oauth/v2/token"

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL   = "llama-3.1-8b-instant"   # fast, free, reliable
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"


# ── Zoho helpers ──────────────────────────────────────────────────────────────

async def refresh_access_token() -> str:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            ZOHO_TOKEN_URL,
            params={
                "grant_type":    "refresh_token",
                "client_id":     ZOHO_CLIENT_ID,
                "client_secret": ZOHO_CLIENT_SECRET,
                "refresh_token": ZOHO_REFRESH_TOKEN,
            },
        )
    data = response.json()
    if "access_token" not in data:
        raise HTTPException(status_code=502, detail=f"Failed to refresh token: {data}")
    expires_in = data.get("expires_in", 3600)
    token_store["access_token"] = data["access_token"]
    token_store["expires_at"]   = time.time() + expires_in - 60
    return token_store["access_token"]


async def get_valid_token() -> str:
    if time.time() >= token_store["expires_at"]:
        return await refresh_access_token()
    return token_store["access_token"]


# ── Zoho routes ───────────────────────────────────────────────────────────────

@app.get("/api/records")
async def get_records(worksheet_name: str = "Sheet1"):
    access_token = await get_valid_token()
    url = (
        f"https://sheet.zoho.in/api/v2/{ZOHO_SHEET_ID}"
        f"?method=worksheet.records.fetch&worksheet_name={worksheet_name}"
    )
    headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)

    if response.status_code == 401:
        access_token = await refresh_access_token()
        headers["Authorization"] = f"Zoho-oauthtoken {access_token}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Zoho API error: {response.text}",
        )
    return response.json()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "token_expires_in": max(0, int(token_store["expires_at"] - time.time())),
    }


# ── Groq sentiment classification ─────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    answers: List[str]
    categories: List[str]


async def _call_groq(answers: List[str], categories: List[str], attempt: int = 0) -> dict:
    cat_map   = {i: c for i, c in enumerate(categories)}
    cat_index = ", ".join(f"{i}={c}" for i, c in cat_map.items())
    numbered  = "\n".join(f"{i + 1}. {a}" for i, a in enumerate(answers))

    prompt = (
        f"Classify each answer. Categories: {cat_index}.\n"
        f"Reply ONLY with a JSON array of category numbers (0-{len(categories) - 1}), one per answer.\n"
        f"Example for 3 answers: [0,2,1]\n\n"
        f"Answers:\n{numbered}\n\nJSON array of numbers:"
    )

    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set in environment")

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            },
            json={
                "model":       GROQ_MODEL,
                "max_tokens":  256,
                "temperature": 0,
                "messages":    [{"role": "user", "content": prompt}],
            },
        )

    # Rate limited — retry with backoff
    if response.status_code == 429:
        if attempt >= 3:
            raise HTTPException(status_code=429, detail="Rate limited by Groq after 3 retries")
        await asyncio.sleep(3 * (2 ** attempt))
        return await _call_groq(answers, categories, attempt + 1)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Groq error: {response.text[:200]}",
        )

    data = response.json()
    raw  = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()

    import re, json as _json
    match = re.search(r"\[[\s\S]*?\]", raw)
    labels = []
    try:
        labels = _json.loads(match.group(0)) if match else []
    except Exception:
        labels = []

    counts = {c: 0 for c in categories}
    for lbl in labels:
        idx = None
        try:
            idx = int(lbl)
        except (ValueError, TypeError):
            pass

        if idx is not None and idx in cat_map:
            counts[cat_map[idx]] += 1
            continue

        # fuzzy fallback
        normalised = re.sub(r"[^a-z ]", "", str(lbl).lower()).strip()
        canonical  = next(
            (c for c in categories
             if re.sub(r"[^a-z ]", "", c.lower()).strip() in normalised
             or normalised in re.sub(r"[^a-z ]", "", c.lower()).strip()),
            None,
        )
        if canonical:
            counts[canonical] += 1

    return counts


@app.post("/api/classify")
async def classify(req: ClassifyRequest):
    if not req.answers:
        return {c: 0 for c in req.categories}
    counts = await _call_groq(req.answers, req.categories)
    return counts