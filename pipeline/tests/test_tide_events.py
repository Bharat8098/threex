import math
from datetime import UTC, datetime, timedelta

import pytest

from compiler.models import TideEventKind
from compiler.tides.events import find_events, mean_range_cm

START = datetime(2026, 1, 1, tzinfo=UTC)


def test_finds_highs_and_lows_of_a_pure_semidiurnal_tide() -> None:
    period_h = 12.42
    heights = [round(100 * math.cos(2 * math.pi * t / period_h)) for t in range(49)]

    events = find_events(START, 60, heights)

    kinds = [event.kind for event in events]
    assert kinds == ([TideEventKind.LOW, TideEventKind.HIGH] * 4)[:7]  # turns every 6.21 h
    for n, event in enumerate(events, start=1):
        expected = START + timedelta(hours=n * period_h / 2)
        assert abs((event.time - expected).total_seconds()) < 5 * 60
        assert abs(event.height_cm) == pytest.approx(100, abs=2)


def test_ignores_series_ends_and_plateaus() -> None:
    assert find_events(START, 60, [0, 10, 20, 30]) == []
    events = find_events(START, 60, [0, 10, 10, 0])
    assert [event.kind for event in events] == [TideEventKind.HIGH]


def test_mean_range() -> None:
    events = find_events(START, 60, [0, 50, 0, -50, 0, 40, 0])
    assert mean_range_cm(events) == pytest.approx((100 + 90) / 2)
