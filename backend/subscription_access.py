import json
from datetime import date

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from dependencies import _decode_token, bearer_scheme, get_db
from models import Admin, Student, Teacher, SchoolProfile
from platform_management import SchoolSubscription, SubscriptionPlan


def require_school_feature(feature: str):
    """Enforce the subscription feature for the authenticated school account."""

    def check_feature(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
        db=Depends(get_db),
    ) -> bool:
        payload = _decode_token(credentials)
        role = payload.get("role")
        subject = payload.get("sub")

        if role not in {"admin", "teacher", "student"}:
            raise HTTPException(status_code=403, detail="School account access required.")

        if not isinstance(subject, str) or not subject.isdigit():
            raise HTTPException(status_code=401, detail="Invalid authentication token.")

        account_model = {
            "admin": Admin,
            "teacher": Teacher,
            "student": Student,
        }[role]
        account = db.get(account_model, int(subject))

        if account is None or not getattr(account, 'is_active', True):
            raise HTTPException(status_code=401, detail="Account is inactive or unavailable.")

        admin_id = account.id if role == "admin" else account.admin_id
        profile = (
            db.query(SchoolProfile)
            .filter(SchoolProfile.admin_id == admin_id)
            .first()
        )

        if profile is None:
            raise HTTPException(status_code=403, detail="No school profile is linked to this account.")

        subscription = (
            db.query(SchoolSubscription)
            .filter(SchoolSubscription.school_profile_id == profile.id)
            .first()
        )

        if subscription is None:
            raise HTTPException(status_code=403, detail="No subscription is assigned to this school.")

        today = date.today()

        if subscription.status not in {"active", "trialing"}:
            raise HTTPException(status_code=403, detail="This school's subscription is not active.")

        if subscription.start_date and subscription.start_date > today:
            raise HTTPException(status_code=403, detail="This school's subscription has not started yet.")

        if subscription.end_date and subscription.end_date < today:
            raise HTTPException(status_code=403, detail="This school's subscription has expired.")

        plan = db.get(SubscriptionPlan, subscription.plan_id)
        if plan is None or not plan.is_active:
            raise HTTPException(status_code=403, detail="The assigned subscription plan is unavailable.")

        try:
            raw_features = (
                subscription.feature_overrides_json
                if subscription.feature_overrides_json is not None
                else (plan.features_json or "[]")
            )
            features = json.loads(raw_features)
        except (TypeError, json.JSONDecodeError):
            raise HTTPException(status_code=403, detail="The subscription feature configuration is invalid.")

        if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
            raise HTTPException(status_code=403, detail="The subscription feature configuration is invalid.")

        if feature not in features:
            raise HTTPException(
                status_code=403,
                detail=f"The '{feature}' feature is not enabled for this school.",
            )

        return True

    return check_feature
