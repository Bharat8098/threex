"""River discharge from GloFAS (Copernicus EMS, CC BY 4.0) via the Open-Meteo Flood API."""

import json
import statistics

from compiler.cache import cache_dir
from compiler.sources.http import get_json

URL = "https://flood-api.open-meteo.com/v1/flood"
FIRST_DAY = "2015-01-01"
LAST_DAY = "2024-12-31"


def median_discharge(lat: float, lon: float) -> float | None:
    """Median daily discharge (m³/s) over ten years at the GloFAS cell nearest the point,
    or None when the cell has no river."""
    key = f"{lat:.3f}_{lon:.3f}"
    cached = cache_dir() / "glofas" / f"{key}.json"
    if cached.exists():
        data = json.loads(cached.read_text())
    else:
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "river_discharge",
            "start_date": FIRST_DAY,
            "end_date": LAST_DAY,
        }
        data = get_json(URL, params)
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data))
    values = [v for v in data.get("daily", {}).get("river_discharge", []) if v is not None]
    if not values:
        return None
    median = statistics.median(values)
    return round(median, 1) if median >= 1 else None
