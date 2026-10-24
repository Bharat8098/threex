"""Human-readable build report and a GeoJSON of spots for reviewing a build on a map."""

import json
from collections import Counter
from pathlib import Path

from compiler.build import TIDE_DAYS, BuildReport


def _skill(skill) -> str:
    if skill is None:
        return "—"
    return f"{skill.rmse_cm:.1f} cm RMSE, {skill.timing_error_minutes:.0f} min timing"


def write_report(report: BuildReport, out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    spots = report.spots
    by_type = Counter(s.water_type.value for s in spots)
    by_kind = Counter(s.features[0].kind.value if s.features else "none" for s in spots)
    lines = [
        f"# Build report: {report.region.name}",
        "",
        f"**{len(spots)} spots**: "
        + ", ".join(f"{n} {t}" for t, n in sorted(by_type.items()))
        + f". {len(report.tide_series)} tide series, {TIDE_DAYS} days each.",
        "",
        "## Candidates",
        "",
        "| Anchors found | |",
        "|---|---|",
        *[f"| {k} | {v} |" for k, v in sorted(report.candidates.anchors.items())],
        "",
        "| Dropped | |",
        "|---|---|",
        *[f"| {k} | {v} |" for k, v in sorted(report.candidates.dropped.items())],
        "",
        "Nearest feature per spot: "
        + ", ".join(f"{k} {v}" for k, v in by_kind.most_common())
        + ".",
        "",
        "## Tide validation",
        "",
        "Both methods are scored on the same held-out stretch of each gauge's record "
        "(observed minus its mean, so weather-driven sea level counts as error).",
        "",
        "| Gauge | Held-out days | Station harmonics | EOT20 | Used near the gauge |",
        "|---|---|---|---|---|",
    ]
    for g in report.gauges:
        held = (
            f"{str(g.check.test_start)[:10]} → {str(g.check.test_end)[:10]}"
            if g.check.test_start is not None
            else "no complete window"
        )
        used = "station harmonics" if g.prefer_station else "EOT20"
        lines.append(
            f"| {g.gauge.name} | {held} | {_skill(g.check.station)} | {_skill(g.check.eot20)} "
            f"| {used} |"
        )
    lines += [
        "",
        "| Tile | Tide series | Method | Spots | Confidence | Mean range |",
        "|---|---|---|---|---|---|",
        *[
            f"| {tile} | {t.id} | {t.model} | {n} | {t.confidence} | {t.mean_range_cm:.0f} cm |"
            for tile, t, n in report.tide_rows()
        ],
        "",
        "## Spots",
        "",
        "| Name | Type | Features | Depth | Confidence |",
        "|---|---|---|---|---|",
    ]
    for s in sorted(spots, key=lambda s: (s.water_type.value, s.name)):
        features = ", ".join(f"{f.kind.value} {f.distance_m:.0f} m" for f in s.features[:3])
        depth = f"{s.depth_m:.1f} m" if s.depth_m is not None else "—"
        lines.append(
            f"| {s.name} | {s.water_type.value} | {features or '—'} | {depth} | {s.confidence} |"
        )
    path = out_dir / "build-report.md"
    path.write_text("\n".join(lines) + "\n")
    return path


def write_geojson(report: BuildReport, out_dir: Path) -> Path:
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [s.coordinate.lon, s.coordinate.lat]},
            "properties": {
                "id": s.id,
                "name": s.name,
                "waterType": s.water_type.value,
                "kind": s.features[0].kind.value if s.features else None,
                "confidence": s.confidence,
            },
        }
        for s in report.spots
    ]
    path = out_dir / "spots.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
    return path
