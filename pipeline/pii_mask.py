"""
PII masking for the customer <-> technician chat relay.

Regex layer catches the common cases. It will NOT catch: images containing
phone numbers, voice notes, or creative spelled-out numbers ("nine eight nine
five..."). Those need an LLM second pass (see mask_with_llm_fallback) and,
for images, OCR before this function ever runs. Treat this as layer 1 of 2 —
ship it, but do not consider the relay "safe" until the LLM pass and image/OCR
handling are also live. See ARCHITECTURE.md risk register.

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
# 4640") and non-Indian formats. Route flagged-clean messages through an LLM
# classifier before final relay if the order value / risk profile warrants it.
# NOT implemented here — wire this as a second n8n node calling Claude API
# with a strict "does this message contain or solicit contact information?
# reply ONLY yes/no" prompt. Do not skip this for Phase 1 sign-off; regex
# alone is not sufficient for the "never leak it anybody" requirement.


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
