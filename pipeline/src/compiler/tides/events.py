"""Find high and low waters in an evenly spaced tide series."""

from datetime import datetime, timedelta

from compiler.models import TideEvent, TideEventKind


def find_events(start: datetime, step_minutes: int, heights_cm: list[int]) -> list[TideEvent]:
    """Return local maxima and minima, refined with a parabola through each turning sample.

    Plateaus (equal neighbours) are skipped rather than double-counted; the first and last
    samples never count as events because the series may still be rising or falling there.
    """
    events: list[TideEvent] = []
    for i in range(1, len(heights_cm) - 1):
        before, here, after = heights_cm[i - 1], heights_cm[i], heights_cm[i + 1]
        if here > before and here >= after:
            kind = TideEventKind.HIGH
        elif here < before and here <= after:
            kind = TideEventKind.LOW
        else:
            continue
        curvature = before - 2 * here + after
        offset = 0.5 * (before - after) / curvature if curvature else 0.0
        peak = here - 0.25 * (before - after) * offset
        minutes = round((i + offset) * step_minutes)
        events.append(
            TideEvent(
                time=start + timedelta(minutes=minutes),
                kind=kind,
                height_cm=round(peak),
            )
        )
    return events


def mean_range_cm(events: list[TideEvent]) -> float:
    """Mean height difference between consecutive high and low waters."""
    ranges = [
        abs(a.height_cm - b.height_cm)
        for a, b in zip(events, events[1:], strict=False)
        if a.kind != b.kind
    ]
    return sum(ranges) / len(ranges) if ranges else 0.0
