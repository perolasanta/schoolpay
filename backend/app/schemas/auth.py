# app/schemas/auth.py

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int          # seconds
    user: "UserProfile"


class UserProfile(BaseModel):
    id: UUID
    school_id: UUID
    full_name: str
    email: str
    phone: Optional[str]
    role: str
    school_name: str
    school_subdomain: str
    subscription_status: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


# Update forward ref
TokenResponse.model_rebuild()
