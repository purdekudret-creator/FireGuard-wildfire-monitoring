
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

    try {
      const source = "VIIRS_NOAA20_NRT";
      const area = "-12,34,35,72";
      const dayRange = "1";

      const nasaUrl =
        "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
        `${encodeURIComponent(apiKey)}/${source}/${area}/${dayRange}`;

      const response = await fetch(nasaUrl, {
        headers: { Accept: "text/csv" }
      });

      const csv = await response.text();

      if (!response.ok) {
        return Response.json(
          {
            error: "NASA FIRMS isteği başarısız.",
            httpStatus: response.status,
            details: csv.slice(0, 500)
          },
          {
            status: 502,
            headers: { "Cache-Control": "no-store" }
          }
        );
      }

      const lines = csv.trim().split(/\r?\n/);

      if (
        !lines.length ||
        lines[0].toLowerCase().includes("error")
      ) {
        return Response.json(
          {
            error: "NASA FIRMS geçerli CSV verisi döndürmedi.",
            details: csv.slice(0, 500)
          },
          { status: 502 }
        );
      }

      const headers = lines.shift().split(",").map(h => h.trim());

      const fires = lines
        .filter(Boolean)
        .map(line => {
          const values = line.split(",");
          const row = Object.fromEntries(
            headers.map((header, i) => [
              header,
              (values[i] || "").trim()
            ])
          );

          return {
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            date: row.acq_date,
            time: row.acq_time,
            confidence: row.confidence,
            satellite: row.satellite,
            frp: Number(row.frp),
            status: "satellite_detection",
            verified: false
          };
        })
        .filter(fire =>
          Number.isFinite(fire.latitude) &&
          Number.isFinite(fire.longitude)
        );

      return Response.json(
        {
          source: "NASA FIRMS",
          region: "Europe (approximate bounding box)",
          count: fires.length,
          note: "Satellite hotspots are not confirmed fires.",
          fires
        },
        {
          headers: {
            "Cache-Control": "no-store; max-age=0"
          }
        }
      );
    } catch (error) {
      return Response.json(
        {
          error: "FireGuard verileri alınamadı.",
          details: String(error.message || error).slice(0, 500)
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }
  }
};
