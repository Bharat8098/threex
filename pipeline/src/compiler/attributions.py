"""Credit lines for every dataset the pipeline may publish. See docs/data-sources.md."""

from compiler.models import Attribution

ATTRIBUTIONS: dict[str, Attribution] = {
    a.id: a
    for a in [
        Attribution(
            id="osm",
            name="OpenStreetMap",
            license="ODbL-1.0",
            url="https://www.openstreetmap.org/copyright",
            text="© OpenStreetMap contributors",
            display_required=True,
        ),
        Attribution(
            id="fes2022",
            name="FES2022 global tide model",
            license="AVISO FES licence",
            url="https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html",
            text=(
                "The FES2022 Tide product was funded by CNES, produced by LEGOS, NOVELTIS and "
                "CLS and made freely available by AVISO"
            ),
            display_required=True,
        ),
        Attribution(
            id="uhslc",
            name="University of Hawaii Sea Level Center",
            license="UHSLC data policy (citation requested)",
            url="https://uhslc.soest.hawaii.edu/",
            text="Tide validation: University of Hawaii Sea Level Center",
            display_required=False,
        ),
        Attribution(
            id="gebco",
            name="GEBCO gridded bathymetry",
            license="GEBCO grid terms of use",
            url="https://www.gebco.net/data_and_products/gridded_bathymetry_data/",
            text="Bathymetry: GEBCO Compilation Group, GEBCO Grid",
            display_required=True,
        ),
        Attribution(
            id="gmw",
            name="Global Mangrove Watch",
            license="CC-BY-4.0",
            url="https://www.globalmangrovewatch.org/",
            text="Mangrove extent: Global Mangrove Watch (CC BY 4.0)",
            display_required=True,
        ),
        Attribution(
            id="allen-coral-atlas",
            name="Allen Coral Atlas",
            license="CC-BY-4.0 (to confirm before first use)",
            url="https://allencoralatlas.org/",
            text="Reef habitat: Allen Coral Atlas",
            display_required=True,
        ),
        Attribution(
            id="coastwatch",
            name="NOAA CoastWatch ERDDAP",
            license="Public domain (U.S. Government work)",
            url="https://coastwatch.pfeg.noaa.gov/erddap/",
            text="Sea temperature and chlorophyll: NOAA CoastWatch",
            display_required=False,
        ),
    ]
}
