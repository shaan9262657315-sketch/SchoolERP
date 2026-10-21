from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import create_access_token
from dependencies import get_db
from models import SuperAdmin
from schemas import SuperAdminLogin
from security import verify_password

router = APIRouter(
    prefix="/auth/super-admin",
    tags=["Super Admin Authentication"],
)


@router.post("/login")
def super_admin_login(payload: SuperAdminLogin, db: Session = Depends(get_db)):
    username = payload.username.strip()
    account = (
        db.query(SuperAdmin)
        .filter(SuperAdmin.username == username)
        .first()
    )

    if account is None or not verify_password(
        payload.password, account.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Super Admin username or password",
        )

    if not account.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Super Admin account is inactive",
        )

    return {
        "access_token": create_access_token(account.id, "super_admin"),
        "token_type": "bearer",
        "super_admin": {"id": account.id, "username": account.username},
    }
