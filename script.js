// Setup canvas and projection
const canvas = document.getElementById("globe");
const context = canvas.getContext("2d");
const container = document.querySelector(".left-panel");

let projection = d3.geoOrthographic()
  .clipAngle(90)
  .rotate([-80, -10]);

let path = d3.geoPath().projection(projection).context(context);

let countries, plotData = [];

// Resize canvas based on .left-panel
function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  canvas.width = width;
  canvas.height = height;

  projection
    .scale(Math.min(width, height) / 2.2)
    .translate([width / 2, height / 2]);

  path = d3.geoPath().projection(projection).context(context);

  draw();
}

// Draw function
function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  // Draw CO₂ points
  if (plotData.length) {
    plotData.forEach(d => {
      const [x, y] = projection([d.lon, d.lat]);
      if (x != null && y != null) {
        context.fillStyle = colorScale(d.co2);
        context.fillRect(x - 3, y - 3, 6, 6);
      }
    });
  }

  // Draw countries
  if (countries) {
    context.fillStyle = "#ffffff04";
    context.strokeStyle = "#000";
    countries.features.forEach(f => {
      context.beginPath();
      path(f);
      context.fill();
      context.stroke();
    });
  }
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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
  scroller
  .setup({ step: ".step" })
  .onStepEnter(async ({ element }) => {
    const file = element.dataset.file;

    updateYear(file);   // ✅ update the map

    const block = element.closest(".step-block");
    const chartDiv = block.querySelector(".chart");

    const data = await d3.csv(file);
    drawChart(chartDiv, data); // draw the chart for this year
});


});

const intro = document.querySelector(".intro");
const scrolly = document.getElementById("scrolly");

const transitionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) { // when intro is scrolled past
      scrolly.classList.add("visible");  // fade in scrolly
      intro.classList.add("slide-up");   // fade/slide out intro
    } else {
      scrolly.classList.remove("visible");
      intro.classList.remove("slide-up");
    }
  });
}, { threshold: 0 });

transitionObserver.observe(intro);




// window.addEventListener("resize", () => {
//   // Update canvas size
//   const width = container.innerWidth;
//   const height = container.innerHeight;
//   canvas.width = width;
//   canvas.height = height;

//   const radius = Math.min(width, height) / 2.2;

//   // Update projection
//   projection
//     .scale(radius)
//     .translate([width / 2, height / 2]);

//   draw();  // redraw globe with new size
// });

