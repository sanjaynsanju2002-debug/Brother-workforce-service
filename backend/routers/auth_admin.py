"""Admin session lifecycle. The PIN is accepted only in a JSON request body."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from lib.auth import SESSION_SECONDS, login_for_attendance, login_with_pin, logout, require_admin
from models.bws import Ok

router = APIRouter(prefix="/admin")


class LoginRequest(BaseModel):
    pin: str
    username: str | None = None


class AttendanceLoginResponse(Ok):
    token: str
    expires_in: int


@router.post("/login", response_model=Ok)
async def login(payload: LoginRequest, request: Request, response: Response) -> Ok:
    await login_with_pin(payload.pin, request, response, payload.username)
    response.headers["Cache-Control"] = "no-store"
    return Ok(ok=True)


@router.post("/attendance-login", response_model=AttendanceLoginResponse)
async def attendance_login(payload: LoginRequest, request: Request, response: Response) -> AttendanceLoginResponse:
    token = await login_for_attendance(payload.pin, request)
    response.headers["Cache-Control"] = "no-store"
    return AttendanceLoginResponse(ok=True, token=token, expires_in=SESSION_SECONDS)


@router.get("/me", dependencies=[Depends(require_admin)])
async def me(request: Request):
    return {"ok": True, **request.state.admin}


@router.post("/logout", response_model=Ok)
async def sign_out(request: Request, response: Response) -> Ok:
    await logout(request, response)
    return Ok(ok=True)
