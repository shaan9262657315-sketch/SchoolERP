import json
import re
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from auth import create_access_token
from database import Base, SessionLocal, engine
from dependencies import (
    _decode_token,
    bearer_scheme,
    get_db,
    get_current_super_admin,
)
from fastapi.security import HTTPAuthorizationCredentials
from models import Admin, SchoolProfile, SuperAdmin
from security import hash_password, verify_password

router = APIRouter(tags=["Platform Management"])

FEATURES = [
    "students", "teachers", "attendance", "results",
    "fees", "homework", "announcements", "school_profile",
]
PERMISSIONS = [
    "accounts:read", "accounts:manage",
    "plans:read", "plans:manage",
    "subscriptions:read", "subscriptions:manage",
    "schools:read",
]
ROLE_DEFAULTS = {
    "platform_admin": PERMISSIONS,
    "billing_admin": [
        "plans:read", "plans:manage",
        "subscriptions:read", "subscriptions:manage", "schools:read",
    ],
    "support_admin": ["accounts:read", "schools:read", "subscriptions:read"],
    "viewer": ["accounts:read", "plans:read", "subscriptions:read", "schools:read"],
}
SUBSCRIPTION_STATUSES = {"active", "trialing", "past_due", "cancelled", "expired"}


class PlatformAccount(Base):
    __tablename__ = "platform_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(40), default="viewer", nullable=False)
    permissions_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly", nullable=False)
    features_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SchoolSubscription(Base):
    __tablename__ = "school_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    school_profile_id: Mapped[int] = mapped_column(
        ForeignKey("school_profiles.id"), unique=True, nullable=False, index=True
    )
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("subscription_plans.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    start_date: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    feature_overrides_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


def _json_list(value: str | None) -> list[str]:
    try:
        result = json.loads(value or "[]")
        return result if isinstance(result, list) else []
    except (ValueError, TypeError):
        return []


def _account_dict(account: PlatformAccount) -> dict[str, Any]:
    return {
        "id": account.id,
        "username": account.username,
        "role": account.role,
        "permissions": _json_list(account.permissions_json),
        "is_active": bool(account.is_active),
        "created_at": account.created_at,
    }


def _plan_dict(plan: SubscriptionPlan) -> dict[str, Any]:
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "price_cents": plan.price_cents,
        "billing_cycle": plan.billing_cycle,
        "features": _json_list(plan.features_json),
        "is_active": bool(plan.is_active),
    }


def initialize_platform_management() -> None:
    PlatformAccount.__table__.create(bind=engine, checkfirst=True)
    SubscriptionPlan.__table__.create(bind=engine, checkfirst=True)
    SchoolSubscription.__table__.create(bind=engine, checkfirst=True)

    db = SessionLocal()
    try:
        starter = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == "Starter"
        ).first()
        if starter is None:
            starter = SubscriptionPlan(
                name="Starter",
                description="Default plan for existing schools. No existing access is removed.",
                price_cents=0,
                billing_cycle="monthly",
                features_json=json.dumps(FEATURES),
                is_active=True,
            )
            db.add(starter)
            db.flush()

        profiles = db.query(SchoolProfile).all()
        for profile in profiles:
            subscription = db.query(SchoolSubscription).filter(
                SchoolSubscription.school_profile_id == profile.id
            ).first()
            if subscription is None:
                db.add(SchoolSubscription(
                    school_profile_id=profile.id,
                    plan_id=starter.id,
                    status="active",
                    start_date=date.today(),
                    end_date=None,
                    feature_overrides_json=None,
                ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_platform_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payload = _decode_token(credentials)
    role = payload.get("role")
    subject = payload.get("sub")

    if not isinstance(subject, str) or not subject.isdigit():
        raise HTTPException(status_code=401, detail="Invalid platform token.")

    if role == "super_admin":
        account = db.get(SuperAdmin, int(subject))
        if account is None or not account.is_active:
            raise HTTPException(status_code=401, detail="Super Admin account is unavailable.")
        return {"kind": "super_admin", "account": account, "permissions": PERMISSIONS}

    if role == "platform_admin":
        account = db.get(PlatformAccount, int(subject))
        if account is None or not account.is_active:
            raise HTTPException(status_code=401, detail="Platform account is unavailable.")
        return {
            "kind": "platform_admin",
            "account": account,
            "permissions": _json_list(account.permissions_json),
        }

    raise HTTPException(status_code=403, detail="Platform account access required.")


def require_permission(*required: str):
    def check(actor: dict[str, Any] = Depends(get_platform_identity)):
        if actor["kind"] == "super_admin":
            return actor
        granted = set(actor["permissions"])
        if not any(permission in granted for permission in required):
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return actor
    return check


class PlatformLoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=1, max_length=128)


class PlatformAccountCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    role: str = "viewer"
    permissions: list[str] | None = None


class PlatformAccountUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None


class PlanCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)
    price_cents: int = Field(default=0, ge=0, le=100000000)
    billing_cycle: str = "monthly"
    features: list[str] = Field(default_factory=list)
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    price_cents: int | None = Field(default=None, ge=0, le=100000000)
    billing_cycle: str | None = None
    features: list[str] | None = None
    is_active: bool | None = None


class SubscriptionAssign(BaseModel):
    plan_id: int
    status: str = "active"
    start_date: date | None = None
    end_date: date | None = None
    feature_overrides: list[str] | None = None


def _validate_permissions(role: str, permissions: list[str] | None) -> list[str]:
    if role not in ROLE_DEFAULTS:
        raise HTTPException(status_code=422, detail="Unsupported platform role.")
    result = ROLE_DEFAULTS[role] if permissions is None else permissions
    if len(set(result)) != len(result) or any(p not in PERMISSIONS for p in result):
        raise HTTPException(status_code=422, detail="One or more permissions are invalid.")
    return result


def _ensure_default_subscriptions(db: Session) -> None:
    starter = db.query(SubscriptionPlan).filter(
        SubscriptionPlan.name == "Starter"
    ).first()
    if starter is None:
        starter = SubscriptionPlan(
            name="Starter",
            description="Default plan for existing schools.",
            price_cents=0,
            billing_cycle="monthly",
            features_json=json.dumps(FEATURES),
            is_active=True,
        )
        db.add(starter)
        db.flush()

    for profile in db.query(SchoolProfile).all():
        existing = db.query(SchoolSubscription).filter(
            SchoolSubscription.school_profile_id == profile.id
        ).first()
        if existing is None:
            db.add(SchoolSubscription(
                school_profile_id=profile.id,
                plan_id=starter.id,
                status="active",
                start_date=date.today(),
                feature_overrides_json=None,
            ))
    db.flush()


def _subscription_dict(db: Session, sub: SchoolSubscription) -> dict[str, Any]:
    profile = db.get(SchoolProfile, sub.school_profile_id)
    plan = db.get(SubscriptionPlan, sub.plan_id)
    admin = db.get(Admin, profile.admin_id) if profile else None
    actual_status = sub.status
    if sub.end_date is not None and sub.end_date < date.today() and actual_status in {"active", "trialing"}:
        actual_status = "expired"
        sub.status = "expired"

    plan_features = _json_list(plan.features_json if plan else "[]")
    features = (
        _json_list(sub.feature_overrides_json)
        if sub.feature_overrides_json is not None
        else plan_features
    )
    return {
        "id": sub.id,
        "school_id": profile.id if profile else None,
        "school_name": profile.school_name if profile else "Unknown school",
        "admin_username": admin.username if admin else None,
        "admin_active": bool(admin.is_active) if admin else False,
        "plan_id": plan.id if plan else None,
        "plan_name": plan.name if plan else "Unknown plan",
        "plan_price_cents": plan.price_cents if plan else 0,
        "status": actual_status,
        "start_date": sub.start_date,
        "end_date": sub.end_date,
        "features": features,
        "uses_plan_features": sub.feature_overrides_json is None,
    }


@router.post("/auth/platform/login")
def platform_login(payload: PlatformLoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip()
    account = db.query(PlatformAccount).filter(
        PlatformAccount.username == username
    ).first()
    if account is None or not verify_password(payload.password, account.password_hash):
        raise HTTPException(status_code=401, detail="Invalid platform username or password.")
    if not account.is_active:
        raise HTTPException(status_code=403, detail="This platform account is inactive.")
    return {
        "access_token": create_access_token(account.id, "platform_admin"),
        "token_type": "bearer",
        "account": _account_dict(account),
    }


@router.get("/platform/accounts")
def list_platform_accounts(
    actor: dict = Depends(require_permission("accounts:read", "accounts:manage")),
    db: Session = Depends(get_db),
):
    return {"total": db.query(PlatformAccount).count(),
            "accounts": [_account_dict(a) for a in db.query(PlatformAccount).order_by(PlatformAccount.id.desc()).all()]}


@router.post("/platform/accounts", status_code=201)
def create_platform_account(
    payload: PlatformAccountCreate,
    actor: dict = Depends(require_permission("accounts:manage")),
    db: Session = Depends(get_db),
):
    username = payload.username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,50}", username):
        raise HTTPException(status_code=422, detail="Username must use letters, numbers, dot, underscore or hyphen.")
    role = payload.role.strip()
    permissions = _validate_permissions(role, payload.permissions)
    if actor["kind"] != "super_admin" and not set(permissions).issubset(set(actor["permissions"])):
        raise HTTPException(status_code=403, detail="You cannot grant permissions you do not have.")
    account = PlatformAccount(
        username=username,
        password_hash=hash_password(payload.password),
        role=role,
        permissions_json=json.dumps(permissions),
        is_active=True,
    )
    db.add(account)
    try:
        db.commit()
        db.refresh(account)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That platform username is already in use.")
    return {"message": "Platform account created.", "account": _account_dict(account)}


@router.patch("/platform/accounts/{account_id}")
def update_platform_account(
    account_id: int,
    payload: PlatformAccountUpdate,
    actor: dict = Depends(require_permission("accounts:manage")),
    db: Session = Depends(get_db),
):
    account = db.get(PlatformAccount, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Platform account not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "username" in changes and changes["username"] is not None:
        username = changes["username"].strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,50}", username):
            raise HTTPException(status_code=422, detail="Invalid username format.")
        account.username = username
    if changes.get("password"):
        account.password_hash = hash_password(changes["password"])
    if "role" in changes and changes["role"] is not None:
        account.role = changes["role"]
    if "permissions" in changes and changes["permissions"] is not None:
        account.permissions_json = json.dumps(_validate_permissions(
            account.role, changes["permissions"]
        ))
    elif "role" in changes and changes["role"] is not None:
        account.permissions_json = json.dumps(ROLE_DEFAULTS[account.role])
    if actor["kind"] != "super_admin":
        if not set(_json_list(account.permissions_json)).issubset(set(actor["permissions"])):
            raise HTTPException(status_code=403, detail="You cannot grant permissions you do not have.")
        if account.id == actor["account"].id and changes.get("is_active") is False:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if "is_active" in changes and changes["is_active"] is not None:
        if account.id == actor["account"].id and not changes["is_active"]:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
        account.is_active = changes["is_active"]
    try:
        db.commit()
        db.refresh(account)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That platform username is already in use.")
    return {"message": "Platform account updated.", "account": _account_dict(account)}


@router.get("/platform/plans")
def list_plans(
    actor: dict = Depends(require_permission("plans:read", "plans:manage")),
    db: Session = Depends(get_db),
):
    plans = db.query(SubscriptionPlan).order_by(SubscriptionPlan.id.asc()).all()
    return {"total": len(plans), "features_catalog": FEATURES, "plans": [_plan_dict(p) for p in plans]}


@router.post("/platform/plans", status_code=201)
def create_plan(
    payload: PlanCreate,
    actor: dict = Depends(require_permission("plans:manage")),
    db: Session = Depends(get_db),
):
    if payload.billing_cycle not in {"monthly", "quarterly", "yearly", "lifetime"}:
        raise HTTPException(status_code=422, detail="Invalid billing cycle.")
    if any(feature not in FEATURES for feature in payload.features) or len(set(payload.features)) != len(payload.features):
        raise HTTPException(status_code=422, detail="Invalid or duplicate feature.")
    plan = SubscriptionPlan(
        name=payload.name.strip(),
        description=payload.description.strip(),
        price_cents=payload.price_cents,
        billing_cycle=payload.billing_cycle,
        features_json=json.dumps(payload.features),
        is_active=payload.is_active,
    )
    db.add(plan)
    try:
        db.commit()
        db.refresh(plan)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A plan with that name already exists.")
    return {"message": "Plan created.", "plan": _plan_dict(plan)}


@router.patch("/platform/plans/{plan_id}")
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    actor: dict = Depends(require_permission("plans:manage")),
    db: Session = Depends(get_db),
):
    plan = db.get(SubscriptionPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("billing_cycle") not in {None, "monthly", "quarterly", "yearly", "lifetime"}:
        raise HTTPException(status_code=422, detail="Invalid billing cycle.")
    if "features" in changes and changes["features"] is not None:
        if any(f not in FEATURES for f in changes["features"]) or len(set(changes["features"])) != len(changes["features"]):
            raise HTTPException(status_code=422, detail="Invalid or duplicate feature.")
        plan.features_json = json.dumps(changes.pop("features"))
    for key, value in changes.items():
        if value is not None:
            setattr(plan, key, value.strip() if key in {"name", "description"} else value)
    try:
        db.commit()
        db.refresh(plan)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A plan with that name already exists.")
    return {"message": "Plan updated.", "plan": _plan_dict(plan)}


@router.get("/platform/schools")
def list_platform_schools(
    actor: dict = Depends(require_permission("schools:read", "subscriptions:manage")),
    db: Session = Depends(get_db),
):
    profiles = db.query(SchoolProfile).order_by(SchoolProfile.school_name.asc()).all()
    return {"schools": [{"id": p.id, "school_name": p.school_name or "Unnamed school"} for p in profiles]}


@router.get("/platform/subscriptions")
def list_subscriptions(
    actor: dict = Depends(require_permission("subscriptions:read", "subscriptions:manage")),
    db: Session = Depends(get_db),
):
    _ensure_default_subscriptions(db)
    rows = db.query(SchoolSubscription).order_by(SchoolSubscription.id.desc()).all()
    result = [_subscription_dict(db, row) for row in rows]
    db.commit()
    return {"total": len(result), "subscriptions": result}


@router.put("/platform/subscriptions/{school_id}")
def assign_subscription(
    school_id: int,
    payload: SubscriptionAssign,
    actor: dict = Depends(require_permission("subscriptions:manage")),
    db: Session = Depends(get_db),
):
    profile = db.get(SchoolProfile, school_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="School not found.")
    plan = db.get(SubscriptionPlan, payload.plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=404, detail="Active subscription plan not found.")
    if payload.status not in SUBSCRIPTION_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid subscription status.")
    start = payload.start_date or date.today()
    if payload.end_date is not None and payload.end_date < start:
        raise HTTPException(status_code=422, detail="Expiry date cannot be before the start date.")
    if payload.feature_overrides is not None:
        if any(f not in FEATURES for f in payload.feature_overrides) or len(set(payload.feature_overrides)) != len(payload.feature_overrides):
            raise HTTPException(status_code=422, detail="Invalid or duplicate feature override.")

    sub = db.query(SchoolSubscription).filter(
        SchoolSubscription.school_profile_id == school_id
    ).first()
    if sub is None:
        sub = SchoolSubscription(school_profile_id=school_id, plan_id=plan.id, start_date=start)
        db.add(sub)
    sub.plan_id = plan.id
    sub.status = payload.status
    sub.start_date = start
    sub.end_date = payload.end_date
    sub.feature_overrides_json = (
        json.dumps(payload.feature_overrides)
        if payload.feature_overrides is not None else None
    )
    db.commit()
    db.refresh(sub)
    return {"message": "School subscription saved.", "subscription": _subscription_dict(db, sub)}


@router.get("/platform/schools/{school_id}/features")
def get_school_features(
    school_id: int,
    actor: dict = Depends(require_permission("subscriptions:read", "subscriptions:manage")),
    db: Session = Depends(get_db),
):
    _ensure_default_subscriptions(db)
    sub = db.query(SchoolSubscription).filter(
        SchoolSubscription.school_profile_id == school_id
    ).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="School subscription not found.")
    result = _subscription_dict(db, sub)
    db.commit()
    return {
        "school_id": school_id,
        "status": result["status"],
        "features": result["features"],
        "feature_access_enabled": result["status"] in {"active", "trialing"},
    }
