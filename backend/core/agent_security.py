import os
import re
from typing import Dict, Any, Optional

# File patterns that MUST NEVER be read, written, or exposed to the LLM or sandbox
SENSITIVE_FILE_PATTERNS = [
    r"^\.?env(\..+)?$",           # .env, .env.local, .env.production, etc.
    r".*\.db$",                    # nulltor.db, sqlite databases
    r".*\.sqlite(\d)?$",
    r".*\.pem$",                   # Private keys & certificates
    r".*\.key$",
    r".*id_rsa.*",
    r".*id_ed25519.*",
    r".*id_ecdsa.*",
    r".*\.pfx$",
    r".*\.p12$",
    r".*nulltor.*config.*\.py$",   # Server configuration
    r".*backend/core/config\.py$",
]

# Sensitive environment key prefixes / substrings that must NEVER be passed to user runtime processes
SENSITIVE_ENV_KEYWORDS = [
    "SECRET", "KEY", "TOKEN", "PASSWORD", "PASS", "AUTH",
    "DATABASE", "DB_", "GROQ", "OPENAI", "BOTPRESS", "JWT",
    "ENCRYPTION", "SALT", "CREDENTIAL", "AWS_", "AZURE_", "GCP_"
]

# Safe system environment variables necessary for compilers/interpreters to function
SAFE_SYSTEM_ENV_VARS = {
    "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE",
    "HOME", "LANG", "LC_ALL", "TERM", "COMSPEC", "PATHEXT",
    "LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)",
    "COMMONPROGRAMFILES", "ALLUSERSPROFILE", "HOMEDRIVE", "HOMEPATH"
}

# Regex patterns for real-time Data Loss Prevention (DLP) secret redaction
DLP_REDACTION_PATTERNS = [
    # JWT Tokens
    (re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}"), "[REDACTED_JWT_TOKEN]"),
    # API Keys (Groq, OpenAI, Anthropic, OpenRouter, Google Gemini, GitHub, GitLab, HuggingFace, Slack, etc.)
    (re.compile(r"(?:gsk_[a-zA-Z0-9_-]{15,}|sk-(?:ant-|proj-|or-v1-)?[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{20,}|glpat-[a-zA-Z0-9]{20,}|AIzaSy[a-zA-Z0-9_-]{30,}|xoxb-[a-zA-Z0-9_-]{20,}|hf_[a-zA-Z0-9]{20,})"), "[REDACTED_API_KEY]"),
    # Database Connection URLs
    (re.compile(r"(?:postgresql|postgres|mysql|sqlite|mongodb(?:\+srv)?):\/\/[^\s\"']+"), "[REDACTED_DB_URL]"),
    # Password & Secret string declarations
    (re.compile(r"""(?i)(["']?(?:password|secret_key|api_key|access_token|private_key|auth_token)["']?\s*[:=]\s*["'])([^"']{4,})(["'])"""), r"\1[REDACTED_SECRET]\3"),
]


def is_sensitive_file(file_path: str) -> bool:
    """
    Checks if a target file path matches any sensitive server or credential files.
    """
    if not file_path:
        return False

    clean_path = file_path.replace("\\", "/").strip().lower()

    # Block directory traversal attempts
    if ".." in clean_path or clean_path.startswith("/") or clean_path.startswith("c:"):
        return True

    base_name = os.path.basename(clean_path)

    for pattern in SENSITIVE_FILE_PATTERNS:
        if re.match(pattern, base_name, re.IGNORECASE) or re.match(pattern, clean_path, re.IGNORECASE):
            return True

    return False


def redact_secrets(text: Optional[str]) -> str:
    """
    Sanitizes text by replacing sensitive secrets, JWTs, API keys, and connection strings
    with safe redacted placeholders before sending to external LLM APIs.
    """
    if not text or not isinstance(text, str):
        return text or ""

    sanitized = text
    for pattern, replacement in DLP_REDACTION_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    return sanitized


def get_sanitized_execution_env(extra_env: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """
    Creates a clean-room execution environment for user scripts and terminal processes.
    Strips ALL server secrets, database URLs, and API keys.
    """
    clean_env: Dict[str, str] = {}

    # 1. Inherit only safe system OS paths
    for key, value in os.environ.items():
        key_upper = key.upper()
        if key_upper in SAFE_SYSTEM_ENV_VARS:
            clean_env[key] = value

    # 2. Strict blacklist filtering on any inherited variables
    for key in list(clean_env.keys()):
        key_upper = key.upper()
        if any(bad in key_upper for bad in SENSITIVE_ENV_KEYWORDS):
            clean_env.pop(key, None)

    # 3. Standard runtime configuration flags
    clean_env["PYTHONUNBUFFERED"] = "1"
    clean_env["PYTHONIOENCODING"] = "utf-8"
    clean_env["PYTHONUTF8"] = "1"
    clean_env["PYTHONPATH"] = ""  # Prevent importing server backend models/core
    clean_env["NODE_OPTIONS"] = "--no-warnings"

    # 4. If the user defined their own project-specific .env variables, attach them
    if extra_env and isinstance(extra_env, dict):
        for k, v in extra_env.items():
            if isinstance(k, str) and isinstance(v, str):
                clean_env[k] = v

    return clean_env
