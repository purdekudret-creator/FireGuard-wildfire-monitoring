
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/fires") {
      return env.ASSETS.fetch(request);
    }

    const apiKey = env.NASA_FIRMS_MAP_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "NASA_FIRMS_MAP_KEY Secret eksik." },
        { status: 500 }
      );
    }

    const source = "VIIRS_NOAA20_NRT";
    const west = -12;
    const south = 34;
    const east = 35;
    const north = 72;
    const step = 5;

    const areas = [];

    for (let lon = west; lon < east; lon += step) {
      for (let lat = south; lat < north; lat += step) {
        areas.push([
          lon,
          lat,
          Math.min(lon + step, east),
          Math.min(lat + step, north)
        ].join(","));
      }
    }

    const unique = new Map();
    const failedAreas = [];

    try {
      // Kontrollü gruplar halinde sorgula.
      for (let i = 0; i < areas.length; i += 6) {
        const batch = areas.slice(i, i + 6);

        const results = await Promise.all(
          batch.map(async area => {
            try {
              const nasaUrl =
                "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
                `${encodeURIComponent(apiKey)}/${source}/${area}/1`;

              const response = await fetch(nasaUrl);

              if (!response.ok) {
                const details = await response.text();

                return {
                  area,
                  error: `HTTP ${response.status}: ${details.slice(0, 200)}`
                };
              }

              const csv = await response.text();
              const lines = csv.trim().split(/\r?\n/);

              if (!csv.trim() || lines.length < 2) {
                return { area, fires: [] };
              }

              const headers = lines.shift()
                .split(",")
                .map(h => h.trim());

              const fires = [];

              for (const line of lines) {
                if (!line.trim()) continue;

                const values = line.split(",");
                const row = Object.fromEntries(
                  headers.map((header, index) => [
                    header,
                    (values[index] || "").trim()
                  ])
                );

                const latitude = Number(row.latitude);
                const longitude = Number(row.longitude);

                if (
                  !Number.isFinite(latitude) ||
                  !Number.isFinite(longitude)
                ) {
                  continue;
                }

                fires.push({
                  latitude,
                  longitude,
                  date: row.acq_date,
                  time: row.acq_time,
                  confidence: row.confidence,
                  satellite: row.satellite,
                  frp: Number(row.frp),
                  status: "satellite_detection",
                  verified: false
                });
              }

              return { area, fires };
            } catch (error) {
              return {
                area,
                error: String(error.message || error).slice(0, 200)
              };
            }
          })
        );

        for (const result of results) {
          if (result.error) {
            failedAreas.push({
              area: result.area,
              error: result.error
            });
            continue;
          }

          for (const fire of result.fires || []) {
            const key = [
              fire.latitude,
              fire.longitude,
              fire.date,
              fire.time,
              fire.satellite
            ].join("|");

            unique.set(key, fire);
          }
        }
      }

      const fires = [...unique.values()];

      return Response.json(
        {
          source: "NASA FIRMS",
          satellite: source,
          region: "Europe (approximate bounding box)",
          count: fires.length,
          failedAreaCount: failedAreas.length,
          failedAreas: failedAreas.slice(0, 10),
          note: "Satellite hotspots are not confirmed fires.",
          fires
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    } catch (error) {
      return Response.json(
        {
          error: "FireGuard taraması tamamlanamadı.",
          details: String(error.message || error).slice(0, 500)
        },
        { status: 502 }
      );
    }
  }
};
