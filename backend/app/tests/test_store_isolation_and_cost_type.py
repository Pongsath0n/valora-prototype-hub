"""Tests for Healholic V1 store fail-closed isolation and cost_type validation.

Covers:
10. Store fail-closed: canonical store enforced, foreign store rejected,
    no silent fallback to first membership.
12. cost_type create/update validation (allowed values, default, invalid
    rejected).
"""
import unittest
from typing import Any, Dict, List, Optional
from unittest.mock import patch

from fastapi import HTTPException

from app.api import store_admin


class StoreFailClosedTests(unittest.TestCase):
    def _memberships(self, store_id: str, role: str = "owner") -> List[Dict[str, Any]]:
        return [{"store_id": store_id, "role": role}]

    def test_canonical_store_resolved_when_no_store_id_supplied(self) -> None:
        canonical = "eecd8da4-fe4c-4b2b-b029-e95625777ea7"
        memberships = self._memberships(canonical, "owner")
        with patch.object(store_admin.settings, "default_store_id", canonical):
            resolved, role = store_admin._resolve_store_id(memberships, None)
        self.assertEqual(resolved, canonical)
        self.assertEqual(role, "owner")

    def test_canonical_store_resolved_when_store_id_matches(self) -> None:
        canonical = "eecd8da4-fe4c-4b2b-b029-e95625777ea7"
        memberships = self._memberships(canonical, "staff")
        with patch.object(store_admin.settings, "default_store_id", canonical):
            resolved, role = store_admin._resolve_store_id(memberships, canonical)
        self.assertEqual(resolved, canonical)
        self.assertEqual(role, "staff")

    def test_foreign_store_id_rejected_when_canonical_configured(self) -> None:
        canonical = "eecd8da4-fe4c-4b2b-b029-e95625777ea7"
        foreign = "00000000-0000-0000-0000-000000000000"
        memberships = self._memberships(canonical, "owner")
        with patch.object(store_admin.settings, "default_store_id", canonical):
            with self.assertRaises(HTTPException) as ctx:
                store_admin._resolve_store_id(memberships, foreign)
        self.assertEqual(ctx.exception.detail, "store_access_denied")

    def test_no_silent_fallback_to_first_membership_when_canonical_configured(self) -> None:
        canonical = "eecd8da4-fe4c-4b2b-b029-e95625777ea7"
        # User has a membership in a DIFFERENT store only.
        other_store = "11111111-1111-1111-1111-111111111111"
        memberships = self._memberships(other_store, "owner")
        with patch.object(store_admin.settings, "default_store_id", canonical):
            with self.assertRaises(HTTPException) as ctx:
                store_admin._resolve_store_id(memberships, None)
        self.assertEqual(ctx.exception.detail, "store_access_denied")

    def test_legacy_fallback_preserved_when_no_canonical_configured(self) -> None:
        memberships = self._memberships("store-legacy", "owner")
        with patch.object(store_admin.settings, "default_store_id", ""):
            resolved, role = store_admin._resolve_store_id(memberships, None)
        self.assertEqual(resolved, "store-legacy")
        self.assertEqual(role, "owner")


class CostTypeValidationTests(unittest.TestCase):
    def test_create_defaults_cost_type_to_ingredient_when_omitted(self) -> None:
        payload = store_admin.IngredientCreate(
            name="Coffee",
            unit="g",
            cost_per_unit=1.0,
            current_stock=0,
            low_stock_threshold=0,
        )
        data = store_admin._sanitize_ingredient_payload(payload)
        self.assertEqual(data["cost_type"], "ingredient")

    def test_create_accepts_allowed_cost_type_values(self) -> None:
        for value in ["ingredient", "packaging", "consumable", "addon", "utility", "other"]:
            payload = store_admin.IngredientCreate(
                name="X",
                unit="g",
                cost_per_unit=1.0,
                current_stock=0,
                low_stock_threshold=0,
                cost_type=value,
            )
            data = store_admin._sanitize_ingredient_payload(payload)
            self.assertEqual(data["cost_type"], value)

    def test_create_rejects_invalid_cost_type(self) -> None:
        payload = store_admin.IngredientCreate(
            name="X",
            unit="g",
            cost_per_unit=1.0,
            current_stock=0,
            low_stock_threshold=0,
            cost_type="machinery",
        )
        with self.assertRaises(HTTPException) as ctx:
            store_admin._sanitize_ingredient_payload(payload)
        self.assertEqual(ctx.exception.detail, "cost_type_invalid")

    def test_update_accepts_allowed_cost_type(self) -> None:
        payload = store_admin.IngredientUpdate(cost_type="packaging")
        data = store_admin._sanitize_ingredient_payload(payload, partial=True)
        self.assertEqual(data["cost_type"], "packaging")

    def test_update_rejects_invalid_cost_type(self) -> None:
        payload = store_admin.IngredientUpdate(cost_type="unknown")
        with self.assertRaises(HTTPException) as ctx:
            store_admin._sanitize_ingredient_payload(payload, partial=True)
        self.assertEqual(ctx.exception.detail, "cost_type_invalid")

    def test_update_blank_cost_type_is_omitted(self) -> None:
        payload = store_admin.IngredientUpdate(cost_type="")
        data = store_admin._sanitize_ingredient_payload(payload, partial=True)
        self.assertNotIn("cost_type", data)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
