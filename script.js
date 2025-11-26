// Setup canvas and projection
const canvas = document.getElementById("globe");

const spaceCanvas = document.getElementById("space-bg");
const spaceCtx = spaceCanvas.getContext("2d");

let spaceWidth = window.innerWidth;
let spaceHeight = window.innerHeight;
let scrollTimeout = null;
let userIsScrolling = false;



let stars = [];
let warpFactor = 0.25;
const WARP_IDLE = 0.25;
const WARP_CRUISE = 0.6;
const WARP_BURST = 40.0;
let warpTarget = WARP_IDLE;
let starGlobalAlpha = 1;
let starTargetAlpha = 1;
let warpTimeout = null;
let slowTimeout = null;
let fadeTimeout = null;
let lastTime = 0;
let warpHuePhase = 0;

function resizeSpaceCanvas() {
  spaceWidth = window.innerWidth;
  spaceHeight = window.innerHeight;
  spaceCanvas.width = spaceWidth;
  spaceCanvas.height = spaceHeight;
}

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
  star.hueOffset = Math.random() * 60 - 30;
  star.hue = 210;
}

function initStars() {
  stars = [];
  for (let i = 0; i < 260; i++) {
    const star = {};
    resetStar(star);
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

  const inStorySteps =
    isInStory && !document.body.classList.contains("cinematic-mode");

  if (inStorySteps) {
    warpFactor = 0;
    warpTarget = 0;
    starGlobalAlpha = 0;
    starTargetAlpha = 0;
    spaceCtx.clearRect(0, 0, spaceWidth, spaceHeight);
    requestAnimationFrame(renderSpace);
    return;
  }

  spaceCtx.fillStyle = "rgba(2, 6, 23, 0.9)";
  spaceCtx.fillRect(0, 0, spaceWidth, spaceHeight);

  warpFactor += (warpTarget - warpFactor) * 0.1 * deltaTime;
  starGlobalAlpha += (starTargetAlpha - starGlobalAlpha) * 0.08 * deltaTime;

  warpHuePhase += warpFactor * 0.12 * deltaTime;

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
      const warpIntensity = Math.min(warpFactor, 10);
      const trailLength = warpIntensity * star.speed * 0.9;
      const tailX = star.x - star.vx * trailLength;
      const tailY = star.y - star.vy * trailLength;

      const baseHue = 220 + 80 * Math.sin(warpHuePhase * 0.5);
      const hue = (baseHue + star.hueOffset + 360) % 360;
      const lightness = 55 + Math.min(warpIntensity, 5) * 7;

      spaceCtx.globalAlpha = starGlobalAlpha;
      spaceCtx.lineCap = "round";
      spaceCtx.strokeStyle = `hsl(${hue}, 80%, ${lightness}%)`;
      spaceCtx.lineWidth = star.size * (0.7 + warpIntensity * 0.04);

      spaceCtx.beginPath();
      spaceCtx.moveTo(tailX, tailY);
      spaceCtx.lineTo(star.x, star.y);
      spaceCtx.stroke();
    }

    spaceCtx.globalAlpha = 1;
  }
  if (!isWarping && document.body.classList.contains("cinematic-mode")) {
    if (warpFactor < 0.3) {
      warpTarget = 0.0; // no more motion
      starTargetAlpha += (0 - starTargetAlpha) * 0.03 * deltaTime;
    }
  }
  requestAnimationFrame(renderSpace);
}

resizeSpaceCanvas();
initStars();
requestAnimationFrame(renderSpace);
window.addEventListener("resize", resizeSpaceCanvas);


const context = canvas.getContext("2d");
const container = document.querySelector(".left-panel");
const introCards = document.getElementById("intro-cards");

function showIntroCards() {
  document.body.classList.add("cinematic-mode");
  document.body.classList.add("story-intro-active");

  setTimeout(() => {
    expandRacePanel();
  }, 800);
}

function hideIntroCards() {
  document.body.classList.remove("story-intro-active");
}



function setProjection(scale, width, height) {
  projection = d3
    .geoOrthographic()
    .clipAngle(90)
    .rotate([0, 0])
    .scale(scale)
    .translate([width / 2, height / 2]);

  path = d3.geoPath().projection(projection).context(context);
}

let projection = d3.geoOrthographic().clipAngle(90).rotate([-80, -10]);
let path = d3.geoPath().projection(projection).context(context);
const sphere = { type: "Sphere" };
const graticule = d3.geoGraticule10();

let countries;
let plotData = [];
let targetScale = 250;

let isEarthVisible = true;
let isInStory = false;
let isWarping = false;
let isZooming = false;
let dotAlpha = 1.0;

let scrollLocked = false;
let absorbNextScroll = false;
let hasStartedStory = false;

const racePanelInner = document.getElementById("race-panel-inner");

// ---------------------------- Bar chart race setup ------------------------------------

let raceInitialized = false;   // so we only build the chart once

// NOTE: update this path if your CSV file has a different name/path.
const RACE_DATA_FILE = "data/top_nations.csv";

// We'll use these outside the init function later if needed
let raceSvg, raceX, raceY, raceColor, raceYears, raceYearDataByYear, raceMaxValue;

function initBarChartRace() {
  if (raceInitialized) return;     // don't re-initialize
  raceInitialized = true;

  const ANIM_DURATION = 450;   // ms for transitions
  const STEP_INTERVAL = 500;   // ms between years; slightly larger than duration

  // 1. Get size of the inner panel after it's expanded
  const margin = { top: 20, right: 40, bottom: 30, left: 120 };
  const innerWidth  = racePanelInner.clientWidth;
  const innerHeight = racePanelInner.clientHeight;

  const width  = innerWidth  - margin.left - margin.right;
  const height = innerHeight - margin.top  - margin.bottom;

  // 2. Create the SVG
  raceSvg = d3
    .select("#race-panel-inner")
    .append("svg")
    .attr("viewBox", `0 0 ${innerWidth} ${innerHeight}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // 3. Load the emissions data
  d3.csv(RACE_DATA_FILE).then(raw => {
    // Parse numbers
    raw.forEach(d => {
      d.year = +d.year;
      d.value = +d.MtCO2_per_year;
      d.region = d.region;
    });

    // Group by year: Map(year -> array of rows for that year)
    const grouped = d3.group(raw, d => d.year);
    raceYears = Array.from(grouped.keys()).sort(d3.ascending);

    // For each year, sort regions by emissions and keep top N
    const TOP_N = 8;

    raceYearDataByYear = new Map();
    raceMaxValue = 0;

    raceYears.forEach(year => {
      const rows = grouped.get(year)
        .slice()
        .sort((a, b) => d3.descending(a.value, b.value))
        .slice(0, TOP_N);

      raceYearDataByYear.set(year, rows);
      const localMax = d3.max(rows, d => d.value);
      if (localMax > raceMaxValue) {
        raceMaxValue = localMax;
      }
    });

    // 4. Scales
    raceX = d3.scaleLinear()
      .domain([0, raceMaxValue])
      .range([0, width * 0.9]);

    raceY = d3.scaleBand()
      .range([0, height])
      .padding(0.25);

    raceColor = d3.scaleOrdinal(d3.schemeTableau10);

    // Axes groups
    const xAxisGroup = raceSvg.append("g")
      .attr("class", "race-x-axis")
      .attr("transform", `translate(0,0)`);

    const yAxisGroup = raceSvg.append("g")
      .attr("class", "race-y-axis");

    // Large year label
    const yearLabel = raceSvg.append("text")
      .attr("class", "race-year-label")
      .attr("x", width)
      .attr("y", height + margin.bottom - 4)
      .attr("text-anchor", "end")
      .attr("fill", "#0f172a")
      .attr("font-size", 26)
      .attr("font-weight", 600);

    // Format for numbers (e.g. 12.3, 105.2)
    const valueFormat = d3.format(".1f");

    // 5. Function to render a given year
    // Called every time we move to a new year
    function renderYear(year, yearData) {
      // update Y positions for this year's ranking
      raceY.domain(yearData.map(d => d.region));

      // ----- BARS -----
      const bars = raceSvg.selectAll("rect.bar")
        .data(yearData, d => d.region); // key = region

      const barsEnter = bars.enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", d => raceY(d.region))
        .attr("height", raceY.bandwidth())
        .attr("width", 0)  // start collapsed
        .attr("fill", d => raceColor(d.region));

      barsEnter.merge(bars)
        .transition()
        .duration(ANIM_DURATION)
        .attr("y", d => raceY(d.region))
        .attr("height", raceY.bandwidth())
        .attr("width", d => raceX(d.value));

      bars.exit()
        .transition()
        .duration(ANIM_DURATION)
        .attr("width", 0)
        .remove();

      // ----- COUNTRY NAMES (static on left) -----
      const nameLabels = raceSvg.selectAll("text.name-label")
        .data(yearData, d => d.region);

      const nameEnter = nameLabels.enter()
        .append("text")
        .attr("class", "name-label")
        .attr("text-anchor", "end")
        .attr("x", -8)   // fixed left position
        .attr("dy", "0.35em")
        .text(d => d.region);

      nameEnter.merge(nameLabels)
        .transition()
        .duration(ANIM_DURATION)
        .attr("y", d => raceY(d.region) + raceY.bandwidth() / 2);

      nameLabels.exit()
        .transition()
        .duration(ANIM_DURATION)
        .style("opacity", 0)
        .remove();

      // ----- VALUES (animated, to the right of bars) -----
      const valueLabels = raceSvg.selectAll("text.value-label")
        .data(yearData, d => d.region);

      const valueEnter = valueLabels.enter()
        .append("text")
        .attr("class", "value-label")
        .attr("text-anchor", "start")
        .attr("dy", "0.35em");

      // tween text + x-position for both new + existing labels
      valueEnter.merge(valueLabels)
        .transition()
        .duration(ANIM_DURATION)
        .tween("text", function(d) {
          const that = this;
          const prev = this.__prevValue || 0;
          const interp = d3.interpolateNumber(prev, d.value);
          this.__prevValue = d.value;  // remember for next year

          return function(t) {
            const v = interp(t);
            that.textContent = valueFormat(v);          // 822.5 → 900.3 smoothly
            that.setAttribute("x", raceX(v) + 6);       // move label with bar end
            that.setAttribute(
              "y",
              raceY(d.region) + raceY.bandwidth() / 2
            );
          };
        });

      valueLabels.exit()
        .transition()
        .duration(ANIM_DURATION)
        .style("opacity", 0)
        .remove();

      // ----- x-axis + big year label -----
      xAxisGroup
        .transition()
        .duration(ANIM_DURATION)
        .call(d3.axisTop(raceX).ticks(4));

      yearLabel.text(year);
    }

    let yearIndex = 0;
    let year = raceYears[yearIndex];
    renderYear(year, raceYearDataByYear.get(year));

    d3.interval(() => {
      yearIndex = (yearIndex + 1) % raceYears.length;
      year = raceYears[yearIndex];
      renderYear(year, raceYearDataByYear.get(year));
    }, STEP_INTERVAL);

  }); // ← closes d3.csv(...).then(raw => { ... })
}


function expandRacePanel() {
  document.body.classList.add("race-lift"); // for the little pop up motion

  const EXPAND_DELAY = 700; // how long you wait before white panel starts
  const STRETCH_DURATION = 500; // MUST match the CSS transition duration

  // make sure scroll is locked during the whole sequence
  if (!scrollLocked) {
    lockScroll();
  }

  setTimeout(() => {
    document.body.classList.add("race-expanded");

    // wait for the stretch animation to finish, THEN unlock scroll
    setTimeout(() => {
      initBarChartRace();   // <-- new line
      unlockScroll();
    }, STRETCH_DURATION);
  }, EXPAND_DELAY);
}

function collapseRacePanel() {
  document.body.classList.remove("race-expanded");
  document.body.classList.remove("race-lift");
}


function preventScroll(e) {
  if (!scrollLocked) return;
  e.preventDefault();
}

function preventScrollKeys(e) {
  if (!scrollLocked) return;
  const keys = [
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ];
  if (keys.includes(e.key)) {
    e.preventDefault();
  }
}

function lockScroll() {
  scrollLocked = true;
  window.addEventListener("wheel", preventScroll, { passive: false });
  window.addEventListener("touchmove", preventScroll, { passive: false });
  window.addEventListener("keydown", preventScrollKeys, { passive: false });
}

function unlockScroll() {
  scrollLocked = false;
  absorbNextScroll = true;

  window.removeEventListener("wheel", preventScroll);
  window.removeEventListener("touchmove", preventScroll);
  window.removeEventListener("keydown", preventScrollKeys);
}
window.addEventListener(
  "wheel",
  (e) => {
    if (absorbNextScroll) {
      absorbNextScroll = false;
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  { passive: false }
);



function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const oldRotation = projection.rotate();

  targetScale = Math.min(width, height) / 2.2;

  setProjection(targetScale, width, height);
  projection.rotate(oldRotation);

  draw();
}



function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const inCinematic = document.body.classList.contains("cinematic-mode");

  if (!isEarthVisible) return;

  if (isZooming) {
    if (countries) {
      const t = projection.translate();
      const cx = t[0];
      const cy = t[1];
      const r = projection.scale();

      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.fillStyle = colorScale(CO2_MIN);
      context.fill();

      if (inCinematic) {
        context.fillStyle = "rgba(15, 23, 42, 1)";
        context.strokeStyle = "rgba(255, 255, 255, 0.95)";
        context.lineWidth = 1.2;
      } else {
        context.fillStyle = "#ffffff08";
        context.strokeStyle = "#000";
        context.lineWidth = 0.6;
      }

      context.beginPath();
      path(countries);
      context.fill();
      context.stroke();
    }

    return;
  }

  if (plotData.length && isEarthVisible) {
    const t = projection.translate();
    const cx = t[0];
    const cy = t[1];
    const r = projection.scale() - 3;

    plotData.forEach((d) => {

      const coords = projection([d.lon, d.lat]);
      if (!coords) return;
      const x = coords[0];
      const y = coords[1];
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) return;

      context.fillStyle = colorScale(d.co2);
      context.fillRect(x - 3, y - 3, 6, 6);
    });
  }

  if (countries) {
    if (inCinematic) {
      context.fillStyle = "rgba(15, 23, 42, 1)";
      context.strokeStyle = "rgba(255, 255, 255, 0.95)";
      context.lineWidth = 1.2;
    } else {
      context.fillStyle = "#ffffff08";
      context.strokeStyle = "#000";
      context.lineWidth = 0.6;
    }

    context.beginPath();
    path(countries);
    context.fill();
    context.stroke();
  }
}

window.addEventListener("resize", resizeCanvas);
const CO2_MIN = 0;
let colorScale = d3.scaleLinear().range(["green", "yellow", "red"]).clamp(true);

function updateYear(csvFile) {
  d3.csv(csvFile).then((data) => {
    const yearData = data.map((d) => ({
      lat: +d.lat,
      lon: +d.lon,
      co2: +d.fco2antt,
    }));

    const landValues = yearData
      .filter((d) => d.co2 > 0)
      .map((d) => d.co2)
      .sort(d3.ascending);

    if (landValues.length) {
      const q90 = d3.quantile(landValues, 0.9);
      const q99 = d3.quantile(landValues, 0.99);
      colorScale.domain([0, q90, q99]);
    }

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

    draw();
  });
}

const stepViews = {
  "step-1850": { lon: 0, lat: 0 },
  "step-1869": { lon: -20, lat: 10 },
  "step-1930": { lon: 80, lat: 20 },
  "step-1945": { lon: -120, lat: 30 },
  "step-1952": { lon: -120, lat: 30 },
  "step-2014": { lon: -120, lat: 30 }
};


let activeRotationTween = null;

function animateGlobeTo(lon, lat, duration = 1600) {
  if (activeRotationTween && activeRotationTween.cancel) {
    activeRotationTween.cancel = true;
  }

  const startRotation = projection.rotate();
  const endRotation = [-lon, -lat, startRotation[2]];
  const interpolator = d3.interpolate(startRotation, endRotation);
  const ease = d3.easeCubicInOut;
  const startTime = performance.now();

  const state = { cancel: false };
  activeRotationTween = state;

  function frame(now) {
    if (state.cancel) return;
    const t = Math.min((now - startTime) / duration, 1);
    const k = ease(t);
    projection.rotate(interpolator(k));
    draw();

    if (t < 1) {
      requestAnimationFrame(frame);
    }
  }

  requestAnimationFrame(frame);
}


// const steps = document.querySelectorAll(".step");

// const observer = new IntersectionObserver(
//   entries => {
//     entries.forEach(entry => {
//       if (!entry.isIntersecting) return;
//       const id = entry.target.id;
//       const view = stepViews[id];
//       if (!view) return;
//       animateGlobeTo(view.lon, view.lat, 1600);
//     });
//   },
//   {
//     threshold: 0.6
//   }
// );

// steps.forEach(step => observer.observe(step));


function drawRegionChart(regionName, chartDiv, data, eventYear) {
  chartDiv.innerHTML = "";

  const parsedData = data.map((d) => ({
    time: +d.time,
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

  const preEvent = parsedData.filter((d) => d.time <= eventYear);
  const postEvent = parsedData.filter((d) => d.time >= eventYear);

  svg
    .append("path")
    .datum(preEvent)
    .attr("fill", "none")
    .attr("stroke", "blue")
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("path")
    .datum(postEvent)
    .attr("fill", "none")
    .attr("stroke", "red")
    .attr("stroke-width", 2)
    .attr("d", line);

  svg
    .append("text")
    .attr("x", width / 2)
    .attr("y", -5)
    .attr("text-anchor", "middle")
    .text(regionName);
}

d3.json("data/countries.json").then((world) => {
  countries = topojson.feature(world, world.objects.countries);
  resizeCanvas();
  draw();

  const firstDataStep = document.querySelector(".step[data-globe-file]");
  if (firstDataStep) {
    const initialCsv = firstDataStep.dataset.globeFile;
    updateYear(initialCsv);
  }

const scroller = scrollama();
scroller.setup({ step: ".step" }).onStepEnter(async ({ element }) => {
  const stepType = element.dataset.stepType;
  if (stepType === "landing") {
    document.body.classList.add("cinematic-mode");
    isEarthVisible = true;
    resizeCanvas();
    return;
  }
  if (stepType === "approach") {
    document.body.classList.add("cinematic-mode");
    isEarthVisible = true;
    draw();
    return;
  }

  document.body.classList.remove("cinematic-mode");
  isEarthVisible = true;

  warpTarget = 0;
  warpFactor = 0;
  starTargetAlpha = 0;
  starGlobalAlpha = 0;

  const id = element.id;
  const view = stepViews[id];
  if (view) {
    animateGlobeTo(view.lon, view.lat, 1600);
  }

  const globeFile = element.dataset.globeFile;
  const chartFile = element.dataset.chartFile;
  const region = element.dataset.region;
  const year = +element.dataset.year;

  updateYear(globeFile);

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

  const firstTime = !hasStartedStory;
  hasStartedStory = true;

  if (firstTime) {
      lockScroll();   
  }

  hideIntroCards();
  clearWarpTimers();

  scrolly.classList.add("visible");
  intro.classList.add("slide-up");

  document.body.classList.add("cinematic-mode");
  resizeCanvas();

  const scrollyTop = scrolly.offsetTop;
  window.scrollTo({
    top: scrollyTop,
    behavior: "auto",
  });


  initStars();

  warpFactor = WARP_IDLE;
  starGlobalAlpha = 1;
  starTargetAlpha = 1;

  isEarthVisible = false;
  draw();

  warpTarget = WARP_BURST;
  const WARP_DURATION = 1300;
  const DECEL_DURATION = 700;
  const ZOOM_DURATION = 1200;

  warpTimeout = setTimeout(() => {
    warpTarget = WARP_CRUISE;

    slowTimeout = setTimeout(() => {
      warpTarget = 0.05;
      starTargetAlpha = 0.3;

      isEarthVisible = true;
      dotAlpha = 0;
      isZooming = true;

      const startScale = targetScale * 0.12;
      const endScale = targetScale * 0.9;

      projection.scale(startScale);
      draw();

      d3.transition()
        .duration(ZOOM_DURATION)
        .ease(d3.easeCubicInOut)
        .tween("zoom-in", () => {
          const interpScale = d3.interpolate(startScale, endScale);
          return (t) => {
            projection.scale(interpScale(t));
            draw();
          };
        })
        .on("end", () => {
          isZooming = false;
          draw();

          warpTarget = WARP_IDLE;
          isWarping = false;

          // start fading stars out immediately
          starTargetAlpha = 0;

          fadeTimeout = setTimeout(() => {
            showIntroCards();
            
          }, 1200); 
        });


      setTimeout(() => {
        if (!document.body.classList.contains("story-intro-active")) {
          showIntroCards();
        }
      }, ZOOM_DURATION + 200);


    }, DECEL_DURATION);
  }, WARP_DURATION);
}


function leaveStory() {
  if (isWarping) return;

  unlockScroll();
  clearWarpTimers();
  hideIntroCards();

  warpTarget = WARP_IDLE;
  starTargetAlpha = 1;
  starGlobalAlpha = 1;
  isEarthVisible = true;
  isInStory = false;

  scrolly.classList.remove("visible");
  intro.classList.remove("slide-up");

  document.body.classList.remove("cinematic-mode");
  resizeCanvas();
  draw();
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


