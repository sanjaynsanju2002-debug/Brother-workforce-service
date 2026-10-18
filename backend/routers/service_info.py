"""A response target is published only after the owner supplies one."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from lib.auth import require_owner
from lib.db import db

router = APIRouter()


class ServiceInfo(BaseModel):
    enquiry_response_target: str = Field(default="", max_length=160)


@router.get("/service-info", response_model=ServiceInfo)
async def public_service_info():
    return ServiceInfo(**(await db.settings.find_one({"id": "public_service_info"}) or {}))


@router.put("/admin/service-info", response_model=ServiceInfo, dependencies=[Depends(require_owner)])
async def update_service_info(payload: ServiceInfo):
    data = {"enquiry_response_target": payload.enquiry_response_target.strip()}
    await db.settings.update_one({"id": "public_service_info"}, {"$set": data}, upsert=True)
    return data
