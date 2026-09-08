from fastapi import APIRouter, Query, Body
from typing import Optional, List, Dict, Any
import httpx
import asyncio

router = APIRouter(prefix="/extensions", tags=["extensions"])

OPEN_VSX_SEARCH_API = "https://open-vsx.org/api/-/search"
OPEN_VSX_ITEM_API = "https://open-vsx.org/api"

# In-memory cache for popular and recent searches (TTL 10 minutes)
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, float] = {}

POPULAR_FALLBACK = [
    {
        "id": "llvm-vs-code-extensions.vscode-clangd",
        "name": "vscode-clangd",
        "displayName": "clangd",
        "publisher": "llvm-vs-code-extensions",
        "description": "C/C++ completion, navigation, and diagnostics using clangd.",
        "version": "0.6.0",
        "downloads": 29125746,
        "rating": 4.9,
        "icon": "https://open-vsx.org/api/llvm-vs-code-extensions/vscode-clangd/0.6.0/file/icon.png",
        "verified": True,
    },
    {
        "id": "golang.Go",
        "name": "Go",
        "displayName": "Go",
        "publisher": "golang",
        "description": "Rich Go language support for Visual Studio Code and Nulltor IDE.",
        "version": "0.56.1",
        "downloads": 38934961,
        "rating": 4.9,
        "icon": "https://open-vsx.org/api/golang/Go/0.56.1/file/go-logo-blue.png",
        "verified": True,
    },
    {
        "id": "ms-azuretools.vscode-docker",
        "name": "vscode-docker",
        "displayName": "Docker",
        "publisher": "ms-azuretools",
        "description": "Makes it easy to create, manage, and debug containerized applications.",
        "version": "2.0.0",
        "downloads": 6601593,
        "rating": 4.8,
        "icon": "https://open-vsx.org/api/ms-azuretools/vscode-docker/2.0.0/file/docker_blue.png",
        "verified": True,
    },
    {
        "id": "DavidAnson.vscode-markdownlint",
        "name": "vscode-markdownlint",
        "displayName": "markdownlint",
        "publisher": "DavidAnson",
        "description": "Markdown linting and style checking for Visual Studio Code.",
        "version": "0.62.1",
        "downloads": 1710359,
        "rating": 4.9,
        "icon": "https://open-vsx.org/api/DavidAnson/vscode-markdownlint/0.62.1/file/markdownlint-128.png",
        "verified": True,
    },
    {
        "id": "dbaeumer.vscode-eslint",
        "name": "vscode-eslint",
        "displayName": "ESLint",
        "publisher": "dbaeumer",
        "description": "Integrates ESLint JavaScript into VS Code and Nulltor IDE.",
        "version": "3.0.34",
        "downloads": 5750413,
        "rating": 4.7,
        "icon": "https://open-vsx.org/api/dbaeumer/vscode-eslint/3.0.34/file/eslint_icon.png",
        "verified": True,
    },
    {
        "id": "esbenp.prettier-vscode",
        "name": "prettier-vscode",
        "displayName": "Prettier - Code formatter",
        "publisher": "esbenp",
        "description": "Code formatter using prettier for JavaScript, TypeScript, HTML, CSS, JSON and more.",
        "version": "12.4.0",
        "downloads": 8950062,
        "rating": 4.7,
        "icon": "https://open-vsx.org/api/esbenp/prettier-vscode/12.4.0/file/icon.png",
        "verified": True,
    },
    {
        "id": "ms-python.python",
        "name": "python",
        "displayName": "Python",
        "publisher": "ms-python",
        "description": "Rich language support for Python, including linting, debugging, code navigation and formatting.",
        "version": "2026.4.0",
        "downloads": 57423823,
        "rating": 4.8,
        "icon": "https://open-vsx.org/api/ms-python/python/2026.4.0/file/icon.png",
        "verified": True,
    },
    {
        "id": "firefox-devtools.vscode-firefox-debug",
        "name": "vscode-firefox-debug",
        "displayName": "Debugger for Firefox",
        "publisher": "firefox-devtools",
        "description": "Debug your web application or browser extension in Firefox.",
        "version": "2.9.10",
        "downloads": 382400,
        "rating": 4.8,
        "icon": "https://open-vsx.org/api/firefox-devtools/vscode-firefox-debug/2.9.10/file/icon.png",
        "verified": True,
    },
]


def _format_extension(raw: Dict[str, Any]) -> Dict[str, Any]:
    namespace = raw.get("namespace", "unknown")
    name = raw.get("name", "extension")
    ext_id = f"{namespace}.{name}"
    display_name = raw.get("displayName") or name
    files = raw.get("files", {}) or {}
    icon = files.get("icon")
    downloads = raw.get("downloadCount", 0)
    rating = raw.get("averageRating")
    if rating is not None:
        rating = round(float(rating), 1)
    else:
        rating = 4.8

    return {
        "id": ext_id,
        "name": name,
        "displayName": display_name,
        "publisher": namespace,
        "description": raw.get("description", ""),
        "version": raw.get("version", "1.0.0"),
        "downloads": downloads,
        "rating": rating,
        "icon": icon,
        "verified": bool(raw.get("verified", False)),
    }


async def _do_search(
    query: Optional[str] = None,
    category: Optional[str] = None,
    size: int = 25,
    offset: int = 0,
) -> Dict[str, Any]:
    cache_key = f"search:{query}:{category}:{size}:{offset}"
    loop = asyncio.get_running_loop()
    now = loop.time()

    if cache_key in _cache and (now - _cache_timestamps.get(cache_key, 0)) < 600:
        return _cache[cache_key]

    params: Dict[str, Any] = {"size": size, "offset": offset}
    if query:
        params["query"] = query.strip()
    else:
        params["sortBy"] = "downloadCount"
        params["sortOrder"] = "desc"

    if category:
        params["category"] = category.strip()

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OPEN_VSX_SEARCH_API, params=params)
            if resp.status_code == 200:
                data = resp.json()
                raw_exts = data.get("extensions", [])
                formatted = [_format_extension(e) for e in raw_exts]
                result = {
                    "total": data.get("totalSize", len(formatted)),
                    "extensions": formatted,
                    "source": "open-vsx.org"
                }
                _cache[cache_key] = result
                _cache_timestamps[cache_key] = now
                return result
    except Exception:
        pass

    # Fallback to curated extensions if network is offline / rate limited
    if query:
        q = query.lower()
        filtered = [
            e for e in POPULAR_FALLBACK
            if q in e["name"].lower() or q in e["displayName"].lower() or q in e["description"].lower() or q in e["publisher"].lower()
        ]
    else:
        filtered = POPULAR_FALLBACK

    return {
        "total": len(filtered),
        "extensions": filtered,
        "source": "fallback"
    }


async def _fetch_single_extension(namespace: str, name: str) -> Optional[Dict[str, Any]]:
    cache_key = f"item:{namespace}.{name}"
    loop = asyncio.get_running_loop()
    now = loop.time()

    if cache_key in _cache and (now - _cache_timestamps.get(cache_key, 0)) < 1800:
        return _cache[cache_key]

    url = f"{OPEN_VSX_ITEM_API}/{namespace}/{name}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                formatted = _format_extension(data)
                _cache[cache_key] = formatted
                _cache_timestamps[cache_key] = now
                return formatted
    except Exception:
        pass

    # Match in fallback
    for item in POPULAR_FALLBACK:
        if item["id"] == f"{namespace}.{name}" or (item["publisher"] == namespace and item["name"] == name):
            return item
    return None


@router.get("/search")
async def search_extensions(
    query: Optional[str] = Query(None, description="Search term for extension query"),
    category: Optional[str] = Query(None, description="Extension category filter"),
    size: int = Query(25, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    return await _do_search(query=query, category=category, size=size, offset=offset)


@router.get("/popular")
async def get_popular_extensions(size: int = Query(25, ge=1, le=50)):
    return await _do_search(query=None, category=None, size=size, offset=0)


@router.get("/detail/{namespace}/{name}")
async def get_extension_detail(namespace: str, name: str):
    res = await _fetch_single_extension(namespace, name)
    if res:
        return res
    return {
        "id": f"{namespace}.{name}",
        "name": name,
        "displayName": name,
        "publisher": namespace,
        "description": "Extension details from Open VSX",
        "version": "1.0.0",
        "downloads": 0,
        "rating": 4.8,
        "icon": None,
        "verified": False,
    }


@router.post("/batch")
async def get_batch_extensions(ids: List[str] = Body(..., embed=True)):
    tasks = []
    for ext_id in ids:
        parts = ext_id.split(".", 1)
        if len(parts) == 2:
            tasks.append(_fetch_single_extension(parts[0], parts[1]))
        else:
            tasks.append(_fetch_single_extension("community", ext_id))
    
    results = await asyncio.gather(*tasks)
    formatted_results = []
    for i, res in enumerate(results):
        if res:
            formatted_results.append(res)
        else:
            ext_id = ids[i]
            parts = ext_id.split(".", 1)
            formatted_results.append({
                "id": ext_id,
                "name": parts[1] if len(parts) == 2 else ext_id,
                "displayName": parts[1] if len(parts) == 2 else ext_id,
                "publisher": parts[0] if len(parts) == 2 else "community",
                "description": "Installed extension",
                "version": "1.0.0",
                "downloads": 0,
                "rating": 4.8,
                "icon": None,
                "verified": False,
            })
    return {"extensions": formatted_results}
