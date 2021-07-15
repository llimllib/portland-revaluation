function map(portlandGeo, data) {
  const width = 800,
    height = 800;
  const svg = d3.select("#canvas");
  const projection = d3.geoMercator().fitExtent(
    [
      [0, 0],
      [width, height],
    ],
    portlandGeo
  );

  const zoom = d3.zoom().scaleExtent([1, 3]).on("zoom", zoomed);

  let path = d3.geoPath().projection(projection);

  const outlineG = svg.append("g").attr("class", "outline");

  const outline = outlineG
    .selectAll("path")
    .data(portlandGeo.features)
    .join("path")
    .attr("d", path)
    .style("fill", "none")
    .style("stroke", "rgba(0,0,0,.3)");

  const scale = d3
    .scaleLinear()
    .domain([
      d3.quantile(data, 0.05, (d) => d.diff.total),
      d3.quantile(data, 0.95, (d) => d.diff.total),
    ])
    .range([0, 1])
    .clamp(true);

  const pointsG = svg.append("g").attr("class", "parcels");

  const points = pointsG
    .selectAll("circle")
    .data(data)
    .join("circle")
    .style("stroke", "none")
    .style("fill", (d) => d3.interpolatePiYG(scale(d.diff.total)))
    .attr("r", 1)
    .attr("cx", (d) => projection([d.geo.lat, d.geo.lng])[0])
    .attr("cy", (d) => projection([d.geo.lat, d.geo.lng])[1]);

  svg.call(zoom);

  function zoomed(event) {
    const { transform } = event;
    pointsG.attr("transform", transform);
    pointsG.attr("stroke-width", 1);
    outlineG.attr("transform", transform);
    outlineG.attr("stroke-width", 1);

    // this is nice-ish, but goes too slow so drop it for now
    // points.transition().attr("r", 1 / transform.k)
    if (transform.k > 2) {
      points.attr("r", 0.5);
    } else {
      points.attr("r", 1);
    }
  }
}

window.addEventListener("DOMContentLoaded", async (_evt) => {
  // TODO: simplify this - 650k is too big
  const portlandGeo = await d3.json("Portland.geojson");
  const data = await d3.json("pts.json");
  map(portlandGeo, data);
});
