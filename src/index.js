
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/fires") {
      if (!env.NASA_FIRMS_MAP_KEY) {
        return Response.json(
          { error: "NASA API anahtarı yapılandırılmamış." },
          { status: 500 }
        );
      }

      const area = "19,39,24,43";
      const source = "VIIRS_NOAA20_NRT";
      const apiUrl =
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/` +
        `${env.NASA_FIRMS_MAP_KEY}/${source}/${area}/1`;

      const response = await fetch(apiUrl);

      if (!response.ok) {
        return Response.json(
          { error: "NASA FIRMS verileri şu anda alınamadı." },
          { status: 502 }
        );
      }

      const csv = await response.text();
      const lines = csv.trim().split(/\r?\n/);
      const headers = lines.shift().split(",");

      const fires = lines
        .filter(line => line.trim())
        .map(line => {
          const values = line.split(",");
          const row = Object.fromEntries(
            headers.map((header, i) => [
              header.trim(),
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
        .filter(fire =>
          Number.isFinite(fire.latitude) &&
          Number.isFinite(fire.longitude)
        );

      return Response.json(
        { source: "NASA FIRMS", count: fires.length, fires },
        { headers: { "Cache-Control": "public, max-age=300" } }
      );
    }

    return env.ASSETS.fetch(request);
  }
};
