const pct = d3.format(".0%");
const dol = d3.format(",r");

function map(data) {
  const scale = d3
    .scaleSequential(
      [
        d3.quantile(data.features, 0.05, (d) => d.properties.diff.total),
        d3.quantile(data.features, 0.95, (d) => d.properties.diff.total),
      ],
      d3.interpolatePiYG
    )
    .clamp(true);

  const map = L.map("canvas").setView([43.67, -70.26], 14);

  // https://docs.mapbox.com/api/maps/styles/
  L.tileLayer(
    "https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}",
    {
      attribution:
        'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
      maxZoom: 18,
      id: "mapbox/light-v10",
      tileSize: 512,
      zoomOffset: -1,
      accessToken:
        "pk.eyJ1IjoibGxpbWxsaWIiLCJhIjoiY2lldXJ1Nzh2MHBvOXQ2bTN1cTYxZHdsNSJ9.2WMSERArMbRJRJDyll5LiQ",
    }
  ).addTo(map);

  let currentRadius = 2;

  const pointLayer = L.geoJSON(data, {
    pointToLayer: function(pt, latlng) {
      const color = scale(pt.properties.diff.total);
      const marker = L.circleMarker(latlng, {
        radius: currentRadius,
        fillColor: color,
        stroke: false,
        color: color,
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      });
      marker.on("mouseover", () => {
        document.getElementById("address").innerText = pt.properties.address;
        document.getElementById("value2020").innerText = dol(
          pt.properties.y2020.total
        );
        document.getElementById("value2021").innerText = dol(
          pt.properties.y2021.total
        );
        document.getElementById("diff").innerText = pct(
          pt.properties.diff.total
        );
      });
      return marker;
    },
  }).addTo(map);

  map.on("zoomend", function(e) {
    console.log("zoomed", map.getZoom());
    let r;
    switch (map.getZoom()) {
      case 13:
      case 14:
        r = 2;
        break;

      case 15:
      case 16:
        r = 4;
        break;

      case 17:
      case 18:
        r = 8;
        break;

      default:
        r = 2;
    }

    if (r != currentRadius) {
      currentRadius = r;
      pointLayer.eachLayer((layer) => {
        layer.setRadius(r);
      });
    }
  });

  let legendSvg = legend({
    color: scale,
    title: "increase in total value",
    width: 200,
    height: 50,
    tickFormat: ".0%",
    marginLeft: 10,
  });

  let legendControl = L.control({ position: "bottomleft" });
  legendControl.onAdd = function() {
    // L.DomUtil.create("div", "legend");
    return legendSvg;
  };
  legendControl.addTo(map);
}

window.addEventListener("DOMContentLoaded", async (_evt) => {
  const data = await d3.json("//cdn.billmill.org/static/reassess/pts.json");
  map(data);
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
