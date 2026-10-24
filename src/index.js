
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
    const batchSize = 5;
    const batch = Math.max(
      0,
      Number.parseInt(url.searchParams.get("batch") || "0", 10) || 0
    );

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

    const selectedAreas = areas.slice(
      batch * batchSize,
      (batch + 1) * batchSize
    );

    if (selectedAreas.length === 0) {
      return Response.json({
        source: "NASA FIRMS",
        batch,
        totalBatches: Math.ceil(areas.length / batchSize),
        count: 0,
        fires: [],
        done: true
      });
    }

    const fires = [];
    const failedAreas = [];

    for (const area of selectedAreas) {
      try {
        const nasaUrl =
          "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
          `${encodeURIComponent(apiKey)}/${source}/${area}/1`;

        const response = await fetch(nasaUrl);

        if (!response.ok) {
          failedAreas.push({
            area,
            error: `NASA HTTP ${response.status}`
          });
          continue;
        }

        const csv = await response.text();
        const lines = csv.trim().split(/\r?\n/);

        if (lines.length < 2) continue;

        const headers = lines.shift().split(",").map(h => h.trim());

        for (const line of lines) {
          if (!line.trim()) continue;

          const values = line.split(",");
          const row = Object.fromEntries(
            headers.map((header, i) => [
              header,
              (values[i] || "").trim()
            ])
          );

          const latitude = Number(row.latitude);
          const longitude = Number(row.longitude);

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
          ) continue;

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
      } catch (error) {
        failedAreas.push({
          area,
          error: String(error.message || error).slice(0, 200)
        });
      }
    }

    const unique = new Map();

    for (const fire of fires) {
      const key = [
        fire.latitude,
        fire.longitude,
        fire.date,
        fire.time,
        fire.satellite
      ].join("|");

      unique.set(key, fire);
    }

    return Response.json(
      {
        source: "NASA FIRMS",
        satellite: source,
        region: "Europe (approximate bounding box)",
        batch,
        totalBatches: Math.ceil(areas.length / batchSize),
        count: unique.size,
        failedAreaCount: failedAreas.length,
        failedAreas,
        done: (batch + 1) * batchSize >= areas.length,
        note: "Satellite hotspots are not confirmed fires.",
        fires: [...unique.values()]
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
};
