"""Compile a region's catalogue from fetched inputs: spots, their facts and tide series."""

import math
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

import numpy as np

from compiler import geo
from compiler.attributions import ATTRIBUTIONS
from compiler.inputs import Inputs
from compiler.models import (
    SCHEMA_VERSION,
    Coordinate,
    ScoringConfig,
    Spot,
    TideSeries,
    TideValidation,
    Tile,
    WaterType,
)
from compiler.models import (
    Region as RegionRef,
)
from compiler.paths import SCORING_CONFIG_FILE
from compiler.projection import LocalProjection
from compiler.publish.layout import Catalogue
from compiler.regions import Gauge, Region
from compiler.sources import erddap, gmw, osm, uhslc
from compiler.spots.candidates import CandidateReport, build_candidates, river_mouths
from compiler.spots.facts import Grids, spot_confidence, spot_facts
from compiler.spots.layers import build_layers
from compiler.tides import predict
from compiler.tides.events import find_events, mean_range_cm

TIDE_DAYS = 45
GAUGE_REACH_KM = 50
EOT20_CELL_DEG = 1 / 8


@dataclass
class GaugeResult:
    gauge: Gauge
    check: predict.GaugeCheck
    station: predict.StationModel | None

    @property
    def prefer_station(self) -> bool:
        s, e = self.check.station, self.check.eot20
        return self.station is not None and s is not None and (e is None or s.rmse_cm < e.rmse_cm)

    @property
    def best(self) -> predict.Skill | None:
        return self.check.station if self.prefer_station else self.check.eot20


@dataclass
class BuildReport:
    region: Region
    candidates: CandidateReport
    gauges: list[GaugeResult]
    tide_series: list[tuple[str, TideSeries]] = field(default_factory=list)
    spots: list[Spot] = field(default_factory=list)

    def tide_rows(self) -> list[tuple[str, TideSeries, int]]:
        """(tile, series, number of spots using it) for every tide series."""
        return [
            (
                tile,
                series,
                sum(
                    1
                    for s in self.spots
                    if s.tide_cluster_id == series.id
                    and geo.encode(s.coordinate.lat, s.coordinate.lon, 4) == tile
                ),
            )
            for tile, series in self.tide_series
        ]


def _km(a: Coordinate, b: Coordinate) -> float:
    dlat = math.radians(b.lat - a.lat)
    dlon = math.radians(b.lon - a.lon) * math.cos(math.radians((a.lat + b.lat) / 2))
    return 6371.0 * math.hypot(dlat, dlon)


def _check_gauges(region: Region, inputs: Inputs) -> list[GaugeResult]:
    results = []
    for gauge in region.gauges:
        times, heights = uhslc.load(inputs.gauges[gauge.id])
        lat, lon = gauge.coordinate.lat, gauge.coordinate.lon
        check = predict.check_gauge(inputs.tide_model_dir, lat, lon, times, heights)
        station = predict.fit_station(times, heights, lat)
        results.append(GaugeResult(gauge, check, station))
    return results


def _tide_confidence(skill: predict.Skill | None, water_types: set[WaterType]) -> float:
    if skill is None:
        score = 0.5
    else:
        score = 0.8 if skill.rmse_cm <= 10 else 0.7 if skill.rmse_cm <= 15 else 0.55
    if WaterType.ESTUARY in water_types:
        score -= 0.15  # backwater lag and damping aren't modelled
    return round(min(0.9, max(0.2, score)), 2)


def _tide_series(
    series_id: str,
    members: list[Spot],
    method: str,
    heights: np.ndarray,
    start: datetime,
    gauge: GaugeResult | None,
) -> TideSeries:
    rounded = [int(round(h)) for h in heights]
    events = find_events(start, 60, rounded)
    best = gauge.best if gauge else None
    validation = None
    if gauge and best:
        validation = TideValidation(
            station_id=gauge.gauge.id,
            station_name=gauge.gauge.name,
            rmse_cm=best.rmse_cm,
            timing_error_minutes=best.timing_error_minutes,
        )
    return TideSeries(
        id=series_id,
        model=method,
        datum="MSL",
        start=start,
        step_minutes=60,
        heights_cm=rounded,
        events=events,
        mean_range_cm=round(mean_range_cm(events), 1),
        confidence=_tide_confidence(best, {s.water_type for s in members}),
        validation=validation,
    )


def build_catalogue(
    region: Region,
    inputs: Inputs,
    *,
    now: datetime,
    discharge: Callable[[float, float], float | None],
    log: Callable[[str], None] = print,
) -> tuple[Catalogue, BuildReport]:
    projection = LocalProjection(region.centre.lat, region.centre.lon)
    bathymetry = erddap.read_grid(inputs.bathymetry, "z")
    log("· map layers")
    layers = build_layers(
        osm.load(inputs.osm),
        gmw.load_polygons(inputs.mangrove_tiles, region),
        bathymetry,
        projection,
    )
    grids = Grids(
        bathymetry=bathymetry,
        sst_normals=erddap.read_monthly_normals(inputs.sst_monthly, "sst"),
        chlorophyll_normals=erddap.read_monthly_normals(
            inputs.chlorophyll_monthly, "chlorophyll", geometric=True
        ),
    )
    log("· candidate spots")
    candidates, candidate_report = build_candidates(layers, region)
    mouths = river_mouths(layers)

    log("· tide gauges")
    gauges = _check_gauges(region, inputs)
    report = BuildReport(region, candidate_report, gauges)

    # Facts and spots (tide cluster ids are filled in below).
    log("· spot facts")
    drafts: list[tuple[Spot, str]] = []
    for candidate in candidates:
        lon, lat = (float(v) for v in projection.to_lonlat(candidate.point.x, candidate.point.y))
        lat, lon = round(lat, 6), round(lon, 6)
        if not region.contains(lat, lon):
            continue
        facts = spot_facts(candidate, layers, grids, mouths, discharge)
        tidal = candidate.water_type is not WaterType.FRESHWATER
        sources = set(facts.sources)
        cluster_key = ""
        if tidal:
            near = min(
                gauges,
                key=lambda g: _km(g.gauge.coordinate, Coordinate(lat=lat, lon=lon)),
                default=None,
            )
            reach = near and _km(near.gauge.coordinate, Coordinate(lat=lat, lon=lon))
            if near and near.prefer_station and reach <= region.station_radius_km:
                cluster_key = f"station:{near.gauge.id}"
                sources.add("uhslc")
            else:
                cell = (round(lat / EOT20_CELL_DEG), round(lon / EOT20_CELL_DEG))
                cluster_key = f"eot20:{cell[0]}:{cell[1]}"
                sources.add("eot20")
            if near and reach <= GAUGE_REACH_KM:
                sources.add("uhslc")
        spot = Spot(
            id=f"sp-{geo.encode(lat, lon, 8)}",
            name=candidate.name,
            locality=candidate.locality,
            coordinate=Coordinate(lat=lat, lon=lon),
            water_type=candidate.water_type,
            access_distance_m=candidate.access_distance_m,
            depth_m=facts.depth_m,
            depth_slope=facts.depth_slope,
            features=facts.features,
            habitat=facts.habitat,
            tide_cluster_id="tc-pending" if tidal else None,
            river=facts.river,
            confidence=spot_confidence(candidate.water_type, facts),
            sources=sorted(sources),
        )
        drafts.append((spot, cluster_key))

    # Tide series: one per (tile, cluster key).
    log("· tide predictions")
    start = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    times = predict.hourly_times(start, TIDE_DAYS * 24)
    by_tile: dict[str, list[tuple[Spot, str]]] = defaultdict(list)
    for spot, key in drafts:
        by_tile[geo.encode(spot.coordinate.lat, spot.coordinate.lon, 4)].append((spot, key))

    tiles = []
    for geohash, members in sorted(by_tile.items()):
        clusters: dict[str, list[Spot]] = defaultdict(list)
        for spot, key in members:
            if key:
                clusters[key].append(spot)
        series_ids: dict[str, str] = {}
        tide_series = []
        for key, cluster in sorted(clusters.items()):
            lat = float(np.mean([s.coordinate.lat for s in cluster]))
            lon = float(np.mean([s.coordinate.lon for s in cluster]))
            here = Coordinate(lat=lat, lon=lon)
            near = min(gauges, key=lambda g: _km(g.gauge.coordinate, here), default=None)
            in_reach = near if near and _km(near.gauge.coordinate, here) <= GAUGE_REACH_KM else None
            if key.startswith("station:"):
                heights = near.station.predict(times)
                method, series_id = "uhslc-harmonics", f"tc-{near.gauge.id}"
            else:
                heights = predict.predict_eot20(inputs.tide_model_dir, lat, lon, times)
                _, row, col = key.split(":")
                cell_lat, cell_lon = int(row) * EOT20_CELL_DEG, int(col) * EOT20_CELL_DEG
                method, series_id = "eot20", f"tc-{geo.encode(cell_lat, cell_lon, 5)}"
            series = _tide_series(series_id, cluster, method, heights, start, in_reach)
            series_ids[key] = series.id
            tide_series.append(series)
            report.tide_series.append((geohash, series))
        spots = [
            spot.model_copy(update={"tide_cluster_id": series_ids[key]}) if key else spot
            for spot, key in members
        ]
        report.spots.extend(spots)
        tiles.append(
            Tile(
                schema_version=SCHEMA_VERSION,
                data_version=now.strftime("%Y.%m.%d"),
                geohash=geohash,
                generated_at=now,
                spots=spots,
                tides=tide_series,
            )
        )

    used = sorted({source for tile in tiles for spot in tile.spots for source in spot.sources})
    catalogue = Catalogue(
        data_version=now.strftime("%Y.%m.%d"),
        region=RegionRef(id=region.id, name=region.name),
        generated_at=now,
        valid_until=start + timedelta(days=TIDE_DAYS),
        tiles=tiles,
        scoring=ScoringConfig.model_validate_json(SCORING_CONFIG_FILE.read_bytes()),
        attributions=[ATTRIBUTIONS[source] for source in used],
    )
    return catalogue, report
