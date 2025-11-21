// Setup canvas and projection
const canvas = document.getElementById("globe");
const context = canvas.getContext("2d");
const width = window.innerWidth;
const height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const projection = d3.geoOrthographic()
  .scale(height / 2.2)
  .translate([width / 2, height / 2])
  .clipAngle(90)
  .rotate([-80, -10]);

const path = d3.geoPath().projection(projection).context(context);

let countries, plotData = [];

// Draw function
function draw() {
  context.clearRect(0, 0, width, height);

  // Draw countries
  if (countries) {
    context.fillStyle = "#aadaff";
    context.strokeStyle = "#000";
    countries.features.forEach(f => {
      context.beginPath();
      path(f);
      context.fill();
      context.stroke();
    });
  }

  // Draw CO₂ points
  if (plotData.length) {
    plotData.forEach(d => {
      const [x, y] = projection([d.lon, d.lat]);
      if (x != null && y != null) {
        context.fillStyle = colorScale(d.co2);
        context.fillRect(x, y, 2, 2);
      }
    });
  }
}
const CO2_MIN = 0.0;
const CO2_MID = 3.01215e-08;
const CO2_MAX = 6.0243e-08;

const colorScale = d3.scaleLinear()
    .domain([CO2_MIN, CO2_MID, CO2_MAX])
    .range(["green", "yellow", "red"]);

function updateYear(csvFile) {
  d3.csv(csvFile).then(data => {
    const yearData = data.map(d => ({
      lat: +d.lat,
      lon: +d.lon,
      co2: +d.fco2antt
    }));

    // Bin points
    const binnedData = d3.rollup(
      yearData,
      v => d3.mean(v, d => d.co2),
      d => Math.round(d.lat),
      d => Math.round(d.lon)
    );

    plotData = [];
    binnedData.forEach((lons, lat) => {
      lons.forEach((co2, lon) => {
        plotData.push({ lat: +lat, lon: +lon, co2 });
      });
    });
    d3.select("#info").text(`Year: ${csvFile}, Min: ${CO2_MIN}, Max: ${CO2_MAX}`);

    draw(); // redraw globe
  });
}



// Load TopoJSON countries and setup initial visualization
d3.json("data/countries.json").then(world => {
  countries = topojson.feature(world, world.objects.countries);

  // Draw empty globe first
  draw();

  // Load initial year (first step)
  const firstStep = document.querySelector(".step");
  if (firstStep) {
    const initialCsv = firstStep.dataset.file;
    updateYear(initialCsv);
  }

  // Setup Scrollama
  const scroller = scrollama();
  scroller.setup({ step: ".step" })
    .onStepEnter(response => {
      const csvFile = response.element.dataset.file;
      updateYear(csvFile);
    });
});


