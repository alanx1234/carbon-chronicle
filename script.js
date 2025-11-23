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

function drawRegionChart(regionName, chartDiv, data, eventYear) {
  chartDiv.innerHTML = ""; // clear previous chart

  const parsedData = data.map(d => ({
    time: +d.time, // numeric year
    date: new Date(+d.time, 0, 1),
    value: +d[regionName]
  }));

  const margin = { top: 20, right: 30, bottom: 30, left: 50 };
  const width = chartDiv.clientWidth - margin.left - margin.right;
  const height = chartDiv.clientHeight - margin.top - margin.bottom;

  const svg = d3.select(chartDiv)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleTime()
    .domain(d3.extent(parsedData, d => d.date))
    .range([0, width]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(parsedData, d => d.value)])
    .range([height, 0]);

  const yAxis = d3.axisLeft(y).tickFormat(d3.format(".2e"));
  const xAxis = d3.axisBottom(x);

  svg.append("g").call(yAxis);
  svg.append("g").attr("transform", `translate(0,${height})`).call(xAxis);

  const line = d3.line()
    .x(d => x(d.date))
    .y(d => y(d.value));

  // Split the data into pre-event and post-event
  const preEvent = parsedData.filter(d => d.time <= eventYear);
  const postEvent = parsedData.filter(d => d.time >= eventYear);

  // Draw two lines with different colors
  svg.append("path")
    .datum(preEvent)
    .attr("fill", "none")
    .attr("stroke", "blue")  // pre-event color
    .attr("stroke-width", 2)
    .attr("d", line);

  svg.append("path")
    .datum(postEvent)
    .attr("fill", "none")
    .attr("stroke", "red")   // post-event color
    .attr("stroke-width", 2)
    .attr("d", line);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", -5)
    .attr("text-anchor", "middle")
    .text(regionName);
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

const scroller = scrollama();
scroller.setup({ step: ".step" })
  .onStepEnter(async ({ element }) => {
    const globeFile = element.dataset.globeFile;
    const chartFile = element.dataset.chartFile;
    const region = element.dataset.region;
    const year = +element.dataset.year;

    // 1️⃣ Update the globe
    updateYear(globeFile);

    // 3️⃣ Load chart data & draw line chart
    const chartData = await d3.csv(chartFile);
    const block = element.closest(".step-block");
    const chartDiv = block.querySelector(".chart");
    drawRegionChart(region, chartDiv, chartData, year);
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


