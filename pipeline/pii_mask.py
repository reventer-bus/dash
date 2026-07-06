"""
PII masking for the customer <-> technician chat relay.

Regex layer catches the common cases. It will NOT catch: images containing
phone numbers, voice notes, or paraphrased solicitation ("call me, number
ending 4640"). Layer 2 is `llm_second_pass()` below — a strict Claude
classifier run on regex-clean messages (fail-closed: unverifiable messages
are withheld by the relay endpoint). Images/voice still need OCR/STT before
any text layer runs — NOT built; keep media messages blocked in n8n until
it is. See ARCHITECTURE.md risk register.

Usage in n8n: paste the body of `mask_message()` into a Function node, or
call this module directly if the relay becomes its own microservice.
"""
import re

# Indian phone numbers: +91 XXXXX XXXXX, 10-digit, with/without spaces/dashes
PHONE_RE = re.compile(
    r"(?:\+?91[\s-]?)?[6-9]\d{9}\b"
    r"|\b\d{5}[\s-]?\d{5}\b"
)

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# UPI handles use bank/PSP suffixes, not TLDs — e.g. name@okhdfcbank, name@ybl, name@paytm
UPI_SUFFIXES = r"(okhdfcbank|okicici|oksbi|okaxis|ybl|paytm|apl|ibl|axl|upi|jio|freecharge)"
UPI_RE = re.compile(r"\b[\w.\-]{2,64}@" + UPI_SUFFIXES + r"\b", re.IGNORECASE)

SOCIAL_HANDLE_RE = re.compile(r"(?:@|instagram\.com/|wa\.me/)[A-Za-z0-9_.]{3,30}")

# Spelled-out digit sequences ("nine eight nine five eight five four six four zero")
# Catches attempts to dictate a phone number in words to dodge the digit regex.
DIGIT_WORDS = r"(zero|one|two|three|four|five|six|seven|eight|nine|oh)"
SPELLED_DIGITS_RE = re.compile(
    r"(?:" + DIGIT_WORDS + r"[\s,-]+){6,}" + DIGIT_WORDS,
    re.IGNORECASE,
)


def mask_message(text: str) -> dict:
    """
    Returns {masked_text, contains_pii_flag, pii_types, matches}.
    matches is for pii_block_audit.pattern_matched — store the pattern
    category hit, not the raw matched string (that stays only in raw_text,
    access-restricted).
    """
    if not text:
        return {"masked_text": text, "contains_pii_flag": False, "pii_types": [], "matches": []}

    masked = text
    pii_types = []

    for label, pattern in [
        ("email", EMAIL_RE),
        ("upi", UPI_RE),
        ("phone", PHONE_RE),
        ("social_handle", SOCIAL_HANDLE_RE),
        ("spelled_digits", SPELLED_DIGITS_RE),
    ]:
        if pattern.search(masked):
            pii_types.append(label)
            masked = pattern.sub("[redacted]", masked)

    return {
        "masked_text": masked,
        "contains_pii_flag": len(pii_types) > 0,
        "pii_types": pii_types,
        "matches": pii_types,  # store category only in pii_block_audit, never the raw match
    }


# ── LLM fallback (second pass) ──────────────────────────────────────────────
# Regex misses paraphrased contact requests ("just call me on my number ending
# 4640") and non-Indian formats. Messages the regex layer finds CLEAN go
# through this classifier before relay. Fail-closed: if the API call errors,
# the caller treats the message as unverified and withholds it.

_LLM_PROMPT = (
    "You are a strict content filter for a marketplace chat where the two "
    "parties must never exchange contact information. Does the following "
    "message contain OR solicit contact information in any form — phone "
    "number (digits, spelled out, partial, 'number ending in...'), email, "
    "social media handle or profile, messaging app reference (WhatsApp, "
    "Telegram, Signal), payment handle (UPI/PayPal), or a physical address? "
    "Asking to 'talk outside', 'call me', or 'find me on' counts as "
    "soliciting. Reply with exactly one word: YES or NO.\n\nMessage:\n"
)


async def llm_second_pass(text: str, api_key: str, model: str = "claude-haiku-4-5-20251001") -> dict:
    """Classify a regex-clean message with Claude. Returns
    {llm_checked: bool, llm_flag: bool | None}.

    llm_checked False means the pass could not run (no key / API error) —
    the caller must NOT treat that as clean.
    """
    if not api_key or not text:
        return {"llm_checked": False, "llm_flag": None}
    import httpx
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 5,
                    "messages": [{"role": "user", "content": _LLM_PROMPT + text}],
                },
            )
            r.raise_for_status()
            answer = "".join(
                block.get("text", "") for block in r.json().get("content", [])
            ).strip().upper()
    except (httpx.HTTPError, ValueError, KeyError):
        return {"llm_checked": False, "llm_flag": None}
    if answer.startswith("YES"):
        return {"llm_checked": True, "llm_flag": True}
    if answer.startswith("NO"):
        return {"llm_checked": True, "llm_flag": False}
    return {"llm_checked": False, "llm_flag": None}  # unexpected output — fail closed


if __name__ == "__main__":
    tests = [
        "call me on 9895854640",
        "reach me at +91 98958 54640",
        "email me at rev@gnilabs.com",
        "pay to rev@okhdfcbank",
        "dm me @reventerr",
        "nine eight nine five eight five four six four zero",
        "the print looks great, thanks!",
    ]
    for t in tests:
        print(t, "->", mask_message(t))
