from fastapi import APIRouter
from typing import List, Dict, Any, Optional
from core.config import settings

router = APIRouter()


@router.get("/ice-servers", summary="Get configured WebRTC ICE servers (STUN / TURN)")
async def get_ice_servers() -> Dict[str, Any]:
    """
    Returns configured ICE servers for WebRTC peer connections.
    Includes public STUN server and optional enterprise TURN server with credentials.
    """
    ice_servers: List[Dict[str, Any]] = []

    # 1. Primary STUN Server
    stun_url = settings.STUN_SERVER_URL or "stun:stun.l.google.com:19302"
    ice_servers.append({"urls": [stun_url]})

    # 2. Authenticated TURN Server (if configured in environment)
    if settings.TURN_SERVER_URL:
        turn_entry: Dict[str, Any] = {"urls": [settings.TURN_SERVER_URL]}
        if settings.TURN_SERVER_USERNAME:
            turn_entry["username"] = settings.TURN_SERVER_USERNAME
        if settings.TURN_SERVER_CREDENTIAL:
            turn_entry["credential"] = settings.TURN_SERVER_CREDENTIAL
        ice_servers.append(turn_entry)

    return {
        "ice_servers": ice_servers,
        "iceServers": ice_servers,
        "has_turn": bool(settings.TURN_SERVER_URL),
    }
