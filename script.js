// Setup canvas and projection
const canvas = document.getElementById("globe");

const spaceCanvas = document.getElementById("space-bg");
const spaceCtx = spaceCanvas.getContext("2d");

let spaceWidth = window.innerWidth;
let spaceHeight = window.innerHeight;

function resizeSpaceCanvas() {
  spaceWidth = window.innerWidth;
  spaceHeight = window.innerHeight;
  spaceCanvas.width = spaceWidth;
  spaceCanvas.height = spaceHeight;
}

let stars = [];
let warpFactor = 0.25;
const WARP_IDLE = 0.25;
const WARP_CRUISE = 0.6;
const WARP_BURST = 40.0; // High burst for the fast transition
let warpTarget = WARP_IDLE;
let starGlobalAlpha = 1;
let starTargetAlpha = 1;
let isInStory = false;
let isWarping = false;
let warpTimeout = null;
let slowTimeout = null;
let fadeTimeout = null;

let lastTime = 0;

function resetStar(star) {
  star.x = spaceWidth / 2;
  star.y = spaceHeight / 2;
  const angle = Math.random() * Math.PI * 2;
  star.vx = Math.cos(angle);
  star.vy = Math.sin(angle);
  star.baseSize = 0.7 + Math.random() * 1.4;
  star.size = star.baseSize;
  star.speed = 0.6 + Math.random() * 2.1;
  star.tw = Math.random() * Math.PI * 2;
  star.twSpeed = 0.015 + Math.random() * 0.025;
  star.hue = 180 + Math.random() * 40;
}

function initStars() {
  stars = [];
  for (let i = 0; i < 260; i++) {
    const star = {};
    resetStar(star);
    // Pre-scatter: Move stars outward immediately so there is no empty gap at start
    const startDistance = Math.random() * Math.max(spaceWidth, spaceHeight);
    star.x += star.vx * startDistance;
    star.y += star.vy * startDistance;
    stars.push(star);
  }
}

function renderSpace(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const deltaTime = (timestamp - lastTime) / 16.66;
  lastTime = timestamp;

  spaceCtx.fillStyle = "rgba(2, 6, 23, 0.9)";
  spaceCtx.fillRect(0, 0, spaceWidth, spaceHeight);

  warpFactor += (warpTarget - warpFactor) * 0.1 * deltaTime;
  starGlobalAlpha += (starTargetAlpha - starGlobalAlpha) * 0.08 * deltaTime;

  for (const star of stars) {
    star.x += star.vx * star.speed * warpFactor * deltaTime;
    star.y += star.vy * star.speed * warpFactor * deltaTime;
    star.tw += star.twSpeed * deltaTime;

    if (
      star.x < -80 ||
      star.x > spaceWidth + 80 ||
      star.y < -80 ||
      star.y > spaceHeight + 80
    ) {
      resetStar(star);
      continue;
    }

    if (warpFactor < 1.5) {
      // --- ORIGINAL LOOK ---
      const twinkle = 0.7 + 0.3 * Math.sin(star.tw);
      const alpha = starGlobalAlpha * twinkle;
      const coreRadius = star.size;
      const glowRadius = star.size * 2.2;

      spaceCtx.globalAlpha = alpha;
      spaceCtx.fillStyle = "#f9fafb";
      spaceCtx.beginPath();
      spaceCtx.arc(star.x, star.y, coreRadius, 0, Math.PI * 2);
      spaceCtx.fill();

      spaceCtx.globalAlpha = alpha * 0.45;
      spaceCtx.fillStyle = "#94a3b8";
      spaceCtx.beginPath();
      spaceCtx.arc(star.x, star.y, glowRadius, 0, Math.PI * 2);
      spaceCtx.fill();
    } else {
      // --- COOL WARP LOOK ---
      const trailLength = warpFactor * star.speed * 0.8;
      const tailX = star.x - star.vx * trailLength;
      const tailY = star.y - star.vy * trailLength;

      spaceCtx.globalAlpha = starGlobalAlpha;
      spaceCtx.lineCap = "round";

      const lightness = 60 + Math.min(warpFactor, 4) * 10;
      spaceCtx.strokeStyle = `hsl(${star.hue}, 80%, ${lightness}%)`;
      spaceCtx.lineWidth = star.size * 0.8;

      spaceCtx.beginPath();
      spaceCtx.moveTo(tailX, tailY);
      spaceCtx.lineTo(star.x, star.y);
      spaceCtx.stroke();
    }

    spaceCtx.globalAlpha = 1;
  }

  requestAnimationFrame(renderSpace);
}

resizeSpaceCanvas();
initStars();
requestAnimationFrame(renderSpace);
window.addEventListener("resize", resizeSpaceCanvas);

const context = canvas.getContext("2d");
const container = document.querySelector(".left-panel");

let projection = d3.geoOrthographic().clipAngle(90).rotate([-80, -10]);

let path = d3.geoPath().projection(projection).context(context);

let countries,
  plotData = [];

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
    plotData.forEach((d) => {
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
    countries.features.forEach((f) => {
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
const CO2_MID = 3.01215e-8;
const CO2_MAX = 6.0243e-8;

const colorScale = d3
  .scaleLinear()
  .domain([CO2_MIN, CO2_MID, CO2_MAX])
  .range(["green", "yellow", "red"]);

function updateYear(csvFile) {
  d3.csv(csvFile).then((data) => {
    const yearData = data.map((d) => ({
      lat: +d.lat,
      lon: +d.lon,
      co2: +d.fco2antt,
    }));

    // Bin points
    const binnedData = d3.rollup(
      yearData,
      (v) => d3.mean(v, (d) => d.co2),
      (d) => Math.round(d.lat),
      (d) => Math.round(d.lon)
    );

    plotData = [];
    binnedData.forEach((lons, lat) => {
      lons.forEach((co2, lon) => {
        plotData.push({ lat: +lat, lon: +lon, co2 });
      });
    });
    d3.select("#info").text(
      `Year: ${csvFile}, Min: ${CO2_MIN}, Max: ${CO2_MAX}`
    );

    draw(); // redraw globe
  });
}

function drawRegionChart(regionName, chartDiv, data, eventYear) {
  chartDiv.innerHTML = ""; // clear previous chart

  const parsedData = data.map((d) => ({
    time: +d.time, // numeric year
    date: new Date(+d.time, 0, 1),
    value: +d[regionName],
  }));

  const margin = { top: 20, right: 30, bottom: 30, left: 50 };
  const width = chartDiv.clientWidth - margin.left - margin.right;
  const height = chartDiv.clientHeight - margin.top - margin.bottom;

  const svg = d3
    .select(chartDiv)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3
    .scaleTime()
    .domain(d3.extent(parsedData, (d) => d.date))
    .range([0, width]);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(parsedData, (d) => d.value)])
    .range([height, 0]);

  const yAxis = d3.axisLeft(y).tickFormat(d3.format(".2e"));
  const xAxis = d3.axisBottom(x);

  svg.append("g").call(yAxis);
  svg.append("g").attr("transform", `translate(0,${height})`).call(xAxis);

  const line = d3
    .line()
    .x((d) => x(d.date))
    .y((d) => y(d.value));

  // Split the data into pre-event and post-event
  const preEvent = parsedData.filter((d) => d.time <= eventYear);
  const postEvent = parsedData.filter((d) => d.time >= eventYear);

  // Draw two lines with different colors
  svg
    .append("path")
    .datum(preEvent)
    .attr("fill", "none")
    .attr("stroke", "blue") // pre-event color
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("path")
    .datum(postEvent)
    .attr("fill", "none")
    .attr("stroke", "red") // post-event color
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", -5)
    .attr("text-anchor", "middle")
    .text(regionName);
}

// Load TopoJSON countries and setup initial visualization
d3.json("data/countries.json").then((world) => {
  countries = topojson.feature(world, world.objects.countries);

  // Draw empty globe first
  draw();

  // Load initial year (first step)
  const firstStep = document.querySelector(".step");
  if (firstStep) {
    const initialCsv = firstStep.dataset.globeFile;
    updateYear(initialCsv);
  }

  const scroller = scrollama();
  scroller.setup({ step: ".step" }).onStepEnter(async ({ element }) => {
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

function clearWarpTimers() {
  if (warpTimeout) {
    clearTimeout(warpTimeout);
    warpTimeout = null;
  }
  if (slowTimeout) {
    clearTimeout(slowTimeout);
    slowTimeout = null;
  }
  if (fadeTimeout) {
    clearTimeout(fadeTimeout);
    fadeTimeout = null;
  }
}

function enterStory() {
  if (isInStory || isWarping) return;
  isInStory = true;
  isWarping = true;
  clearWarpTimers();

  scrolly.classList.add("visible");
  intro.classList.add("slide-up");

  starTargetAlpha = 1;
  warpTarget = WARP_BURST;

  warpTimeout = setTimeout(() => {
    warpTarget = WARP_CRUISE;

    slowTimeout = setTimeout(() => {
      warpTarget = 0.02;

      fadeTimeout = setTimeout(() => {
        starTargetAlpha = 0;
        isWarping = false;
      }, 1400);
    }, 1400);
  }, 400);
}

function leaveStory() {
  isInStory = false;
  isWarping = false;
  clearWarpTimers();

  warpTarget = WARP_IDLE;
  starTargetAlpha = 1;

  scrolly.classList.remove("visible");
  intro.classList.remove("slide-up");
}

const transitionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        enterStory();
      } else {
        leaveStory();
      }
    });
  },
  { threshold: 0.2 }
);

transitionObserver.observe(intro);
