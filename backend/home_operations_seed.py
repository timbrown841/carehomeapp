"""Safelyn Systems — Home Operations & Compliance check-type catalogue.

Seeded on startup (idempotent). Each entry defines:
  - frequency_days  — used to compute "next due" and "overdue" status
  - fields[]        — schema for the quick-entry modal
  - status_rules    — deterministic pass/fail/action_needed evaluation
  - requires_photo  — visual evidence prompt
  - requires_manager_review — flips logs into manager review queue when failing

Categories used in the UI:
  - environmental_safety  → Tab "Safety Checks" → grouped by `group`
  - property_health_safety → also under Safety Checks (different group)
  - audits → Audits group
"""

CHECK_TYPES = [
    # ---------- Temperature checks ----------
    {
        "id": "fridge_temperature",
        "name": "Fridge temperature",
        "category": "environmental_safety",
        "group": "Temperature & food safety",
        "icon": "Thermometer",
        "frequency_days": 1,
        "description": "Daily fridge temperature reading. Safe range 0–5°C.",
        "fields": [
            {"key": "location", "label": "Fridge / location", "type": "text", "required": True, "placeholder": "Kitchen fridge"},
            {"key": "temperature_c", "label": "Temperature (°C)", "type": "number", "required": True, "min": -10, "max": 30, "step": 0.1},
        ],
        "status_rules": {"field": "temperature_c", "ok_min": 0, "ok_max": 5, "warn_max": 8},
        "requires_photo": False,
        "requires_manager_review": False,
    },
    {
        "id": "freezer_temperature",
        "name": "Freezer temperature",
        "category": "environmental_safety",
        "group": "Temperature & food safety",
        "icon": "Snowflake",
        "frequency_days": 1,
        "description": "Daily freezer temperature reading. Safe ≤ −18°C.",
        "fields": [
            {"key": "location", "label": "Freezer / location", "type": "text", "required": True, "placeholder": "Kitchen freezer"},
            {"key": "temperature_c", "label": "Temperature (°C)", "type": "number", "required": True, "min": -40, "max": 10, "step": 0.1},
        ],
        "status_rules": {"field": "temperature_c", "ok_max": -18, "warn_max": -15},
        "requires_photo": False,
        "requires_manager_review": False,
    },
    {
        "id": "water_temp_hot",
        "name": "Hot water outlet temperature",
        "category": "environmental_safety",
        "group": "Water hygiene",
        "icon": "Droplets",
        "frequency_days": 7,
        "description": "Weekly hot water outlet check. Must reach ≥50°C within 1 minute.",
        "fields": [
            {"key": "outlet", "label": "Outlet / room", "type": "text", "required": True, "placeholder": "Bathroom 1 basin"},
            {"key": "temperature_c", "label": "Temperature (°C)", "type": "number", "required": True, "min": 0, "max": 90, "step": 0.5},
        ],
        "status_rules": {"field": "temperature_c", "ok_min": 50, "warn_min": 45},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "water_temp_cold",
        "name": "Cold water outlet temperature",
        "category": "environmental_safety",
        "group": "Water hygiene",
        "icon": "Droplets",
        "frequency_days": 7,
        "description": "Weekly cold water outlet check. Must reach ≤20°C within 2 minutes.",
        "fields": [
            {"key": "outlet", "label": "Outlet / room", "type": "text", "required": True, "placeholder": "Bathroom 1 basin"},
            {"key": "temperature_c", "label": "Temperature (°C)", "type": "number", "required": True, "min": 0, "max": 40, "step": 0.5},
        ],
        "status_rules": {"field": "temperature_c", "ok_max": 20, "warn_max": 23},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "legionella_flush",
        "name": "Legionella / outlet flushing",
        "category": "environmental_safety",
        "group": "Water hygiene",
        "icon": "Droplets",
        "frequency_days": 7,
        "description": "Weekly run-through of little-used outlets for at least 2 minutes.",
        "fields": [
            {"key": "outlets_flushed", "label": "Outlets flushed", "type": "text", "required": True, "placeholder": "e.g. spare en-suite, garage tap"},
            {"key": "minutes", "label": "Run for (minutes)", "type": "number", "required": True, "min": 1, "max": 30, "step": 1},
        ],
        "status_rules": {"field": "minutes", "ok_min": 2},
        "requires_photo": False,
        "requires_manager_review": False,
    },
    # ---------- Fire safety ----------
    {
        "id": "fire_alarm_test",
        "name": "Fire alarm test",
        "category": "environmental_safety",
        "group": "Fire safety",
        "icon": "BellRing",
        "frequency_days": 7,
        "description": "Weekly call-point test. Rotate the call-point used each week.",
        "fields": [
            {"key": "call_point", "label": "Call point tested", "type": "text", "required": True, "placeholder": "Hallway, ground floor"},
            {"key": "panel_clear", "label": "Panel reset & clear?", "type": "checkbox", "required": True},
            {"key": "audible_everywhere", "label": "Audible in all rooms?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["panel_clear", "audible_everywhere"]},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "smoke_alarm_check",
        "name": "Smoke alarm check",
        "category": "environmental_safety",
        "group": "Fire safety",
        "icon": "Flame",
        "frequency_days": 30,
        "description": "Monthly visual + button-test of every smoke alarm head.",
        "fields": [
            {"key": "heads_tested", "label": "Heads tested (count)", "type": "number", "required": True, "min": 0, "max": 100, "step": 1},
            {"key": "all_responsive", "label": "All responsive?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["all_responsive"]},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "emergency_lighting",
        "name": "Emergency lighting",
        "category": "environmental_safety",
        "group": "Fire safety",
        "icon": "Lightbulb",
        "frequency_days": 30,
        "description": "Monthly function test of emergency lights (push-button / key-switch).",
        "fields": [
            {"key": "all_lit", "label": "All lights illuminated?", "type": "checkbox", "required": True},
            {"key": "duration_ok", "label": "Held for ≥30 seconds?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["all_lit", "duration_ok"]},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "fire_drill",
        "name": "Fire drill",
        "category": "environmental_safety",
        "group": "Fire safety",
        "icon": "Siren",
        "frequency_days": 90,
        "description": "Quarterly fire drill. Time evacuation + record any concerns.",
        "fields": [
            {"key": "evac_minutes", "label": "Evac time (minutes)", "type": "number", "required": True, "min": 0, "max": 30, "step": 0.5},
            {"key": "people_present", "label": "People present", "type": "number", "required": True, "min": 0, "max": 100, "step": 1},
            {"key": "concerns", "label": "Concerns / actions", "type": "text", "required": False},
        ],
        "status_rules": {"field": "evac_minutes", "ok_max": 4, "warn_max": 6},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    # ---------- Property & H&S ----------
    {
        "id": "sharps_check",
        "name": "Sharps check",
        "category": "property_health_safety",
        "group": "Health & safety",
        "icon": "Syringe",
        "frequency_days": 7,
        "description": "Weekly sharps inventory + safe-disposal check.",
        "fields": [
            {"key": "bin_under_three_quarter", "label": "Sharps bin <3/4 full?", "type": "checkbox", "required": True},
            {"key": "all_accounted", "label": "All sharps accounted for?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["bin_under_three_quarter", "all_accounted"]},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "window_restrictor_check",
        "name": "Window restrictor check",
        "category": "property_health_safety",
        "group": "Health & safety",
        "icon": "Square",
        "frequency_days": 30,
        "description": "Monthly visual check of every restrictor on opening windows above ground floor.",
        "fields": [
            {"key": "rooms_checked", "label": "Rooms checked", "type": "number", "required": True, "min": 0, "max": 50, "step": 1},
            {"key": "all_secure", "label": "All restrictors secure?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["all_secure"]},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "vehicle_check",
        "name": "Vehicle check",
        "category": "property_health_safety",
        "group": "Health & safety",
        "icon": "Car",
        "frequency_days": 7,
        "description": "Weekly vehicle walk-around: tyres, lights, fluids, mileage, cleanliness.",
        "fields": [
            {"key": "vehicle", "label": "Vehicle / reg", "type": "text", "required": True, "placeholder": "Home minibus AB12 CDE"},
            {"key": "mileage", "label": "Mileage", "type": "number", "required": True, "min": 0, "step": 1},
            {"key": "tyres_ok", "label": "Tyres OK?", "type": "checkbox", "required": True},
            {"key": "lights_ok", "label": "Lights OK?", "type": "checkbox", "required": True},
            {"key": "fluids_ok", "label": "Fluids OK?", "type": "checkbox", "required": True},
        ],
        "status_rules": {"all_required_true": ["tyres_ok", "lights_ok", "fluids_ok"]},
        "requires_photo": False,
        "requires_manager_review": False,
    },
    # ---------- Audits ----------
    {
        "id": "cleaning_audit",
        "name": "Cleaning audit",
        "category": "audits",
        "group": "Audits",
        "icon": "Sparkles",
        "frequency_days": 7,
        "description": "Weekly cleaning standards audit across all communal areas.",
        "fields": [
            {"key": "score", "label": "Score (out of 10)", "type": "number", "required": True, "min": 0, "max": 10, "step": 1},
            {"key": "areas_below_standard", "label": "Areas below standard", "type": "text", "required": False, "placeholder": "e.g. dining, bathroom 2"},
        ],
        "status_rules": {"field": "score", "ok_min": 8, "warn_min": 6},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "hs_audit",
        "name": "Health & safety audit",
        "category": "audits",
        "group": "Audits",
        "icon": "ShieldCheck",
        "frequency_days": 30,
        "description": "Monthly H&S walk-round of the home. Score & list actions.",
        "fields": [
            {"key": "score", "label": "Score (out of 10)", "type": "number", "required": True, "min": 0, "max": 10, "step": 1},
            {"key": "actions", "label": "Actions identified", "type": "text", "required": False},
        ],
        "status_rules": {"field": "score", "ok_min": 8, "warn_min": 6},
        "requires_photo": False,
        "requires_manager_review": True,
    },
    {
        "id": "room_inspection",
        "name": "Room inspection",
        "category": "audits",
        "group": "Audits",
        "icon": "DoorOpen",
        "frequency_days": 30,
        "description": "Monthly bedroom inspection (cleanliness, condition, hazards).",
        "fields": [
            {"key": "rooms_inspected", "label": "Rooms inspected", "type": "number", "required": True, "min": 0, "max": 50, "step": 1},
            {"key": "issues", "label": "Issues noted", "type": "text", "required": False},
        ],
        "status_rules": {},  # always ok unless notes flag manually
        "requires_photo": False,
        "requires_manager_review": False,
    },
]


def evaluate_status(check_type: dict, values: dict) -> str:
    """Deterministic pass/fail evaluation. Returns 'ok' | 'action_needed' | 'fail'."""
    rules = check_type.get("status_rules") or {}
    if not rules:
        return "ok"

    if "all_required_true" in rules:
        for k in rules["all_required_true"]:
            if not values.get(k):
                return "fail"
        return "ok"

    field = rules.get("field")
    if field is None:
        return "ok"
    raw = values.get(field)
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return "action_needed"

    ok_min = rules.get("ok_min")
    ok_max = rules.get("ok_max")
    warn_min = rules.get("warn_min")
    warn_max = rules.get("warn_max")

    in_ok = True
    if ok_min is not None and v < ok_min:
        in_ok = False
    if ok_max is not None and v > ok_max:
        in_ok = False
    if in_ok:
        return "ok"

    in_warn = True
    if warn_min is not None and v < warn_min:
        in_warn = False
    if warn_max is not None and v > warn_max:
        in_warn = False
    # If only warn bound is set on the failing side, treat warn-zone as action_needed
    if (warn_min is not None or warn_max is not None) and in_warn:
        return "action_needed"
    return "fail"
