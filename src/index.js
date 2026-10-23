
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/fires") {
      const apiKey = env.NASA_FIRMS_MAP_KEY;

      if (!apiKey) {
        return Response.json(
          {
            error: "NASA anahtarı eksik.",
            message:
              "Cloudflare Worker Settings bölümüne NASA_FIRMS_MAP_KEY adlı Secret ekleyin."
          },
          { status: 500 }
        );
      }

      try {
        const area = "19,39,24,43";
        const source = "VIIRS_NOAA20_NRT";
        const nasaUrl =
          `https://firms.modaps.eosdis.nasa.gov/api/area/csv/` +
          `${encodeURIComponent(apiKey)}/${source}/${area}/1`;

        const response = await fetch(nasaUrl);

        if (!response.ok) {
          return Response.json(
            { error: "NASA FIRMS verileri alınamadı." },
            { status: 502 }
          );
        }

        const csv = await response.text();
        const lines = csv.trim().split(/\r?\n/);

        if (lines.length < 2) {
          return Response.json({
            source: "NASA FIRMS",
            count: 0,
            fires: []
          });
        }

        const headers = lines.shift().split(",").map(h => h.trim());

        const fires = lines
          .filter(line => line.trim())
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
              frp: Number(row.frp)
            };
          })
          .filter(f =>
            Number.isFinite(f.latitude) &&
            Number.isFinite(f.longitude)
          );

        return Response.json(
          {
            source: "NASA FIRMS",
            count: fires.length,
            fires
          },
          {
            headers: {
              "Cache-Control": "public, max-age=300"
            }
          }
        );
      } catch {
        return Response.json(
          { error: "Yangın verileri alınırken bağlantı hatası oluştu." },
          { status: 502 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
