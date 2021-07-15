//TODO:
// * slim down geojson
// * flip lat and lng to be correct in the geodata
// * responsive map size
// * verify tooltip works on phone
// * figure out how to handle condos - ex. 99 Brackett st is 3 units but currently only showing one
const settings = {
  width: 1024,
  height: 800,
};

function calcVoronoi(data) {
  const delaunay = d3.Delaunay.from(
    data,
    (d) => d.geo.x,
    (d) => d.geo.y
  );
  const voronoi = delaunay.voronoi([
    -1,
    -1,
    settings.width + 1,
    settings.height + 1,
  ]);

  var cells = data.map((d, i) => [d, voronoi.cellPolygon(i)]);

  return [delaunay, cells];
}

function map(portlandGeo, data) {
  const svg = d3.select("#canvas");
  const projection = d3.geoMercator().fitExtent(
    [
      [0, 0],
      [settings.width, settings.height],
    ],
    portlandGeo
  );

  const zoom = d3.zoom().scaleExtent([1, 5]).on("zoom", zoomed);

  let path = d3.geoPath().projection(projection);

  // add the city outline
  const outlineG = svg.append("g").attr("class", "outline");

  outlineG
    .selectAll("path")
    .data(portlandGeo.features)
    .join("path")
    .attr("d", path)
    .style("fill", "none")
    .style("stroke", "rgba(0,0,0,.3)");

  const scale = d3
    .scaleSequential(
      [
        d3.quantile(data, 0.05, (d) => d.diff.total),
        d3.quantile(data, 0.95, (d) => d.diff.total),
      ],
      d3.interpolatePiYG
    )
    .clamp(true);

  // add a point for each parcel
  const pointsG = svg.append("g").attr("class", "parcels");

  const tooltip = d3
    .select("body")
    .append("div")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("visibility", "hidden")
    .style("padding", "10px")
    .style("background", "rgba(0,0,0,0.6)")
    .style("border-radius", "4px")
    .style("color", "#fff");

  data.forEach((d) => {
    // these are currently reversed by accident, lat is lng and vice versa
    let pt = projection([d.geo.lng, d.geo.lat]);
    d.geo.x = pt[0];
    d.geo.y = pt[1];
  });

  let [delaunay, voronoiCells] = calcVoronoi(data);

  const pct = d3.format(".0%");
  const dol = d3.format(",r");
  // when we zoom we set this
  let transform;

  svg.on("mouseover", function(e, d) {
    const [mx, my] = d3.pointer(event, this);

    // this doesn't work with zooming. Fix with something like this approach:
    // https://observablehq.com/@d3/delaunay-find-zoom
    const p = transform.invert(d3.pointer(event));
    const nearest = delaunay.find(...p);
    //const nearest = delaunay.find(mx, my);
    const pt = voronoiCells[nearest][0];
    tooltip
      .html(
        `<div>${pt.geo.full_name}
<ul>
  <li>2020 value: $${dol(pt["2020"].total)}</li>
  <li>2021 value: $${dol(pt["2021"].total)}</li>
  <li>2020 value: ${pct(pt.diff.total)}</li>
</div>`
      )
      .style("visibility", "visible")
      .style("top", e.pageY + 10 + "px")
      .style("left", e.pageX + 10 + "px");
  });

  const points = pointsG
    .selectAll("circle")
    .data(data)
    .join("circle")
    .style("stroke", "none")
    .style("fill", (d) => scale(d.diff.total))
    .attr("r", 1)
    .attr("cx", (d) => d.geo.x)
    .attr("cy", (d) => d.geo.y);

  // add the legend
  svg
    .append("g")
    .attr("transform", "translate(30,20)")
    .append(() =>
      legend({
        color: scale,
        title: "increase in total value",
        width: 200,
        height: 50,
        tickFormat: ".0%",
      })
    );

  svg.call(zoom).call(zoom.transform, d3.zoomIdentity);

  function zoomed(e) {
    // this closes over an outer variable so we can reference it to find points
    // correctly even when we're zoomed
    transform = e.transform;
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

// source: Mike Bostock, https://observablehq.com/@d3/color-legend
// modification for Vanilla JS instead of Observable based on: https://stackoverflow.com/a/64807612/1102199
// Additionally modified by Will Jobs to make ordinal legends displayed vertically

function ramp(color, n = 256) {
  var canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  for (let i = 0; i < n; ++i) {
    context.fillStyle = color(i / (n - 1));
    context.fillRect(i, 0, 1, 1);
  }
  return canvas;
}

function legend({
  color,
  title,
  tickSize = 6,
  width = 320,
  height = 44 + tickSize,
  marginTop = 18,
  marginRight = 0,
  marginBottom = 16 + tickSize,
  marginLeft = 0,
  ticks = width / 64,
  tickFormat,
  tickValues,
  reverseOrdinal,
} = {}) {
  let legendType;

  const svg = d3
    .create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "visible")
    .style("display", "block");

  let tickAdjust = (g) =>
    g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
  let x;

  // Continuous
  if (color.interpolate) {
    legendType = "continuous";
    const n = Math.min(color.domain().length, color.range().length);

    x = color
      .copy()
      .rangeRound(
        d3.quantize(d3.interpolate(marginLeft, width - marginRight), n)
      );

    svg
      .append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr(
        "xlink:href",
        ramp(
          color.copy().domain(d3.quantize(d3.interpolate(0, 1), n))
        ).toDataURL()
      );
  }

  // Sequential
  else if (color.interpolator) {
    legendType = "sequential";
    x = Object.assign(
      color
        .copy()
        .interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
      {
        range() {
          return [marginLeft, width - marginRight];
        },
      }
    );

    svg
      .append("image")
      .attr("x", marginLeft)
      .attr("y", marginTop)
      .attr("width", width - marginLeft - marginRight)
      .attr("height", height - marginTop - marginBottom)
      .attr("preserveAspectRatio", "none")
      .attr("xlink:href", ramp(color.interpolator()).toDataURL());

    // OVERWRITTEN: always use user-specified number of ticks
    // scaleSequentialQuantile doesn’t implement ticks or tickFormat.
    //if (!x.ticks) {
    if (tickValues === undefined) {
      const n = Math.round(ticks + 1);
      tickValues = d3
        .range(n)
        .map((i) => d3.quantile(color.domain(), i / (n - 1)));
    }
    if (typeof tickFormat !== "function") {
      tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
    }
    //}
  }

  // Threshold
  else if (color.invertExtent) {
    legendType = "threshold";
    const thresholds = color.thresholds
      ? color.thresholds() // scaleQuantize
      : color.quantiles
        ? color.quantiles() // scaleQuantile
        : color.domain(); // scaleThreshold

    const thresholdFormat =
      tickFormat === undefined
        ? (d) => d
        : typeof tickFormat === "string"
          ? d3.format(tickFormat)
          : tickFormat;

    x = d3
      .scaleLinear()
      .domain([-1, color.range().length - 1])
      .rangeRound([marginLeft, width - marginRight]);

    svg
      .append("g")
      .selectAll("rect")
      .data(color.range())
      .join("rect")
      .attr("x", (d, i) => x(i - 1))
      .attr("y", marginTop)
      .attr("width", (d, i) => x(i) - x(i - 1))
      .attr("height", height - marginTop - marginBottom)
      .attr("fill", (d) => d);

    tickValues = d3.range(thresholds.length);
    tickFormat = (i) => thresholdFormat(thresholds[i], i);
  }

  // Ordinal
  else {
    legendType = "ordinal";
    x = d3
      .scaleBand()
      .domain(reverseOrdinal ? color.domain().reverse() : color.domain())
      .rangeRound([height - marginBottom, marginTop]);

    svg
      .append("g")
      .selectAll("rect")
      .data(color.domain())
      .join("rect")
      .attr("x", marginLeft)
      .attr("y", x)
      .attr("height", Math.max(0, x.bandwidth() - 1))
      .attr("width", Math.max(0, x.bandwidth() - 1))
      .attr("fill", color);

    //tickAdjust = () => { };
    //let tickAdjust = g => g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height);
    tickAdjust = function(g) {
      g.selectAll(".tick").each(function() {
        gtick = d3.select(this);
        gtick.attr("transform", gtick.attr("transform").replace("(0,", "(20,"));
      });
    };
  }

  svg
    .append("g")
    .attr(
      "transform",
      legendType == "ordinal"
        ? "translate(0,0)"
        : `translate(0, ${height - marginBottom})`
    )
    .call(
      (legendType == "ordinal" ? d3.axisRight(x) : d3.axisBottom(x))
        .ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
        .tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
        .tickSize(tickSize)
        .tickValues(tickValues)
    )
    .call(tickAdjust)
    .call((g) => g.select(".domain").remove())
    .call((g) =>
      g
        .append("text")
        .attr("x", marginLeft)
        .attr(
          "y",
          legendType == "ordinal" ? 10 : marginTop + marginBottom - height - 6
        )
        .attr("fill", "currentColor")
        .attr("text-anchor", "start")
        .attr("font-weight", "bold")
        .attr("class", "legend-title")
        .text(title)
    );

  return svg.node();
}
