export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/fires") {
      const apiKey = env.NASA_FIRMS_MAP_KEY;

      if (!apiKey) {
        return Response.json(
          { error: "NASA_FIRMS_MAP_KEY Secret eksik." },
          { status: 500 }
        );
      }

      try {
        // Yaklaşık Avrupa sınırları
        const west = -12;
        const south = 34;
        const east = 35;
        const north = 72;
        const step = 5;

        const source = "VIIRS_NOAA20_NRT";
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

        const results = await Promise.all(
          areas.map(async area => {
            const nasaUrl =
              "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
              `${encodeURIComponent(apiKey)}/${source}/${area}/1`;

            const response = await fetch(nasaUrl);

            if (!response.ok) {
              throw new Error("NASA FIRMS isteği başarısız.");
            }

            const csv = await response.text();
            const lines = csv.trim().split(/\r?\n/);

            if (lines.length < 2) return [];

            const headers = lines.shift().split(",").map(h => h.trim());

            return lines.filter(Boolean).map(line => {
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
            }).filter(f =>
              Number.isFinite(f.latitude) &&
              Number.isFinite(f.longitude)
            );
          })
        );

        const unique = new Map();

        for (const fire of results.flat()) {
          const key = [
            fire.latitude,
            fire.longitude,
            fire.date,
            fire.time,
            fire.satellite
          ].join("|");

          unique.set(key, fire);
        }

        const fires = [...unique.values()];

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
              "Cache-Control": "public, max-age=300"
            }
          }
        );
      } catch (error) {
        return Response.json(
          {
            error: "Avrupa verileri alınamadı.",
            message: "NASA FIRMS sınırları veya bağlantısı kontrol edilmeli."
          },
          { status: 502 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
         
