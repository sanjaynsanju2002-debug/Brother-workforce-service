"""Admin session lifecycle. The PIN is accepted only in a JSON request body."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from lib.auth import login_with_pin, logout, require_admin
from models.bws import Ok

router = APIRouter(prefix="/admin")


class LoginRequest(BaseModel):
    pin: str
    username: str | None = None


@router.post("/login", response_model=Ok)
async def login(payload: LoginRequest, request: Request, response: Response) -> Ok:
    await login_with_pin(payload.pin, request, response, payload.username)
    response.headers["Cache-Control"] = "no-store"
    return Ok(ok=True)


@router.get("/me", dependencies=[Depends(require_admin)])
async def me(request: Request):
    return {"ok": True, **request.state.admin}


@router.post("/logout", response_model=Ok)
async def sign_out(request: Request, response: Response) -> Ok:
    await logout(request, response)
    return Ok(ok=True)
