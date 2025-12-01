const canvas = document.getElementById("globe");

const spaceCanvas = document.getElementById("space-bg");
const spaceCtx = spaceCanvas.getContext("2d");

let spaceWidth = window.innerWidth;
let spaceHeight = window.innerHeight;
let scrollTimeout = null;
let userIsScrolling = false;

let hasExitedIntro = false;

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
let hasWarped = false;
let activeRegionLabel = "";

const globeCache = {};



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

    // FIX: Draw the dark background instead of clearing it to transparency
    spaceCtx.fillStyle = "#020617";
    spaceCtx.fillRect(0, 0, spaceWidth, spaceHeight);

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
      warpTarget = 0.0;
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

let raceInitialized = false;

const RACE_DATA_FILE = "data/top_nations.csv";

let raceSvg,
  raceX,
  raceY,
  raceColor,
  raceYears,
  raceYearDataByYear,
  raceMaxValue;

function initBarChartRace() {
  if (raceInitialized) return;
  raceInitialized = true;

  const ANIM_DURATION = 170;
  const STEP_INTERVAL = 180;

  const margin = { top: 20, right: 40, bottom: 30, left: 120 };
  const innerWidth = racePanelInner.clientWidth;
  const innerHeight = racePanelInner.clientHeight;

  const width = innerWidth - margin.left - margin.right;
  const height = innerHeight - margin.top - margin.bottom;

  raceSvg = d3
    .select("#race-panel-inner")
    .append("svg")
    .attr("viewBox", `0 0 ${innerWidth} ${innerHeight}`)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  d3.csv(RACE_DATA_FILE).then((raw) => {
    raw.forEach((d) => {
      d.year = +d.year;
      d.value = +d.MtCO2_per_year;
      d.region = d.region;
    });

    const grouped = d3.group(raw, (d) => d.year);
    raceYears = Array.from(grouped.keys()).sort(d3.ascending);

    const TOP_N = 8;

    raceYearDataByYear = new Map();
    raceMaxValue = 0;

    raceYears.forEach((year) => {
      const rows = grouped
        .get(year)
        .slice()
        .sort((a, b) => d3.descending(a.value, b.value))
        .slice(0, TOP_N);

      raceYearDataByYear.set(year, rows);
      const localMax = d3.max(rows, (d) => d.value);
      if (localMax > raceMaxValue) {
        raceMaxValue = localMax;
      }
    });

    raceX = d3
      .scaleLinear()
      .domain([0, raceMaxValue])
      .range([0, width * 0.9]);

    raceY = d3.scaleBand().range([0, height]).padding(0.25);

    raceColor = d3.scaleOrdinal(d3.schemeTableau10);

    const xAxisGroup = raceSvg
      .append("g")
      .attr("class", "race-x-axis")
      .attr("transform", `translate(0,0)`);

    const yAxisGroup = raceSvg.append("g").attr("class", "race-y-axis");

    const yearLabel = raceSvg
      .append("text")
      .attr("class", "race-year-label")
      .attr("x", width)
      .attr("y", height + margin.bottom - 4)
      .attr("text-anchor", "end")
      .attr("fill", "#0f172a")
      .attr("font-size", 26)
      .attr("font-weight", 600);

    const valueFormat = d3.format(".1f");

    function renderYear(year, yearData) {
      raceY.domain(yearData.map((d) => d.region));

      const bars = raceSvg
        .selectAll("rect.bar")
        .data(yearData, (d) => d.region);

      const barsEnter = bars
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", 0)
        .attr("y", (d) => raceY(d.region))
        .attr("height", raceY.bandwidth())
        .attr("width", 0)
        .attr("rx", 3)
        .attr("ry", 3)
        .attr("fill", (d) => raceColor(d.region));

      barsEnter
        .merge(bars)
        .transition()
        .duration(ANIM_DURATION)
        .attr("y", (d) => raceY(d.region))
        .attr("height", raceY.bandwidth())
        .attr("width", (d) => raceX(d.value));

      bars
        .exit()
        .transition()
        .duration(ANIM_DURATION)
        .attr("width", 0)
        .remove();

      const nameLabels = raceSvg
        .selectAll("text.name-label")
        .data(yearData, (d) => d.region);

      const nameEnter = nameLabels
        .enter()
        .append("text")
        .attr("class", "name-label")
        .attr("text-anchor", "end")
        .attr("x", -8)
        .attr("dy", "0.35em")
        .text((d) => d.region);

      nameEnter
        .merge(nameLabels)
        .transition()
        .duration(ANIM_DURATION)
        .attr("y", (d) => raceY(d.region) + raceY.bandwidth() / 2);

      nameLabels
        .exit()
        .transition()
        .duration(ANIM_DURATION)
        .style("opacity", 0)
        .remove();

      const valueLabels = raceSvg
        .selectAll("text.value-label")
        .data(yearData, (d) => d.region);

      const valueEnter = valueLabels
        .enter()
        .append("text")
        .attr("class", "value-label")
        .attr("text-anchor", "start")
        .attr("dy", "0.35em");

      valueEnter
        .merge(valueLabels)
        .transition()
        .duration(ANIM_DURATION)
        .tween("text", function (d) {
          const that = this;
          const prev = this.__prevValue || 0;
          const interp = d3.interpolateNumber(prev, d.value);
          this.__prevValue = d.value;

          return function (t) {
            const v = interp(t);
            that.textContent = valueFormat(v);
            that.setAttribute("x", raceX(v) + 6);
            that.setAttribute("y", raceY(d.region) + raceY.bandwidth() / 2);
          };
        });

      valueLabels
        .exit()
        .transition()
        .duration(ANIM_DURATION)
        .style("opacity", 0)
        .remove();

      xAxisGroup
        .transition()
        .duration(ANIM_DURATION)
        .call(d3.axisTop(raceX).ticks(4));
    }

    let currentYearIndex = 0;

    let year = raceYears[currentYearIndex];
    renderYear(year, raceYearDataByYear.get(year));
    yearLabel.text(year);

    let raceInterval = null;
    const racePanel = document.getElementById("race-panel-left");
    const playButton = document.getElementById("race-play-button");

    function handleRaceCompletion() {
      if (raceInterval) {
        raceInterval.stop();
      }
      racePanel.classList.add("race-paused");
    }

    function startRace() {
      currentYearIndex = 0;
      racePanel.classList.remove("race-paused");

      year = raceYears[currentYearIndex];
      renderYear(year, raceYearDataByYear.get(year));
      yearLabel.text(year);

      raceInterval = d3.interval(() => {
        currentYearIndex += 2;

        if (currentYearIndex >= raceYears.length) {
          currentYearIndex = raceYears.length - 1;
          year = raceYears[currentYearIndex];
          renderYear(year, raceYearDataByYear.get(year));
          yearLabel.text(year);

          handleRaceCompletion();
          return;
        }

        year = raceYears[currentYearIndex];
        renderYear(year, raceYearDataByYear.get(year));

        yearLabel.text(year);
      }, STEP_INTERVAL);
    }

    if (playButton) {
      playButton.addEventListener("click", startRace);
    }

    startRace();
  });
}

function expandRacePanel() {
  document.body.classList.add("race-lift");

  const EXPAND_DELAY = 700;
  const STRETCH_DURATION = 500;

  if (!scrollLocked) {
    lockScroll();
  }

  setTimeout(() => {
    document.body.classList.add("race-expanded");

    setTimeout(() => {
      initBarChartRace();

      const proceedBtn = document.getElementById("proceed-btn");
      if (proceedBtn) {
        proceedBtn.classList.add("visible");
      }
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
  if (scrollLocked) return;
  scrollLocked = true;
  document.body.classList.add("scroll-locked");
  window.addEventListener("wheel", preventScroll, { passive: false });
  window.addEventListener("touchmove", preventScroll, { passive: false });
  window.addEventListener("keydown", preventScrollKeys, { passive: false });
}

function unlockScroll() {
  scrollLocked = false;
  absorbNextScroll = true;
  document.body.classList.remove("scroll-locked");

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

  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  canvas.width = width;
  canvas.height = height;

  const oldRotation = projection.rotate();

  targetScale = Math.min(width, height) / 2.2;

  setProjection(targetScale, width, height);
  projection.rotate(oldRotation);

  draw();
}

function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const inCinematic = document.body.classList.contains("cinematic-mode");

  if (!isEarthVisible && !isZooming) return;

  if (isZooming) {
    if (countries && isEarthVisible) {
      const t = projection.translate();
      const cx = t[0];
      const cy = t[1];
      const r = projection.scale();

      context.beginPath();
      context.arc(cx, cy, r, 0, Math.PI * 2);
      context.fillStyle = OCEAN_COLOR;
      context.fill();

      const glowGrad = context.createRadialGradient(
        cx,
        cy,
        r * 0.95,
        cx,
        cy,
        r * 1.1
      );
      glowGrad.addColorStop(0, ATMOS_INNER);
      glowGrad.addColorStop(1, ATMOS_OUTER);

      context.beginPath();
      context.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
      context.fillStyle = glowGrad;
      context.fill();

      context.fillStyle = "rgba(0,0,0,0)";
      context.strokeStyle = "rgba(148, 163, 184, 0.9)";
      context.lineWidth = inCinematic ? 1.2 : 0.8;

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

    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fillStyle = OCEAN_COLOR;
    context.fill();

    const glowGrad = context.createRadialGradient(
      cx,
      cy,
      r * 0.95,
      cx,
      cy,
      r * 1.1
    );
    glowGrad.addColorStop(0, ATMOS_INNER);
    glowGrad.addColorStop(1, ATMOS_OUTER);

    context.beginPath();
    context.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    context.fillStyle = glowGrad;
    context.fill();

    const domain = colorScale.domain();
    const maxVal = domain[domain.length - 1] || 1;

    plotData.forEach((d) => {
      const coords = projection([d.lon, d.lat]);
      if (!coords) return;
      const x = coords[0];
      const y = coords[1];
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) return;

      const intensity = Math.min(1, d.co2 / maxVal);
      const radius = 1.4 + intensity * 1.7;
      const alpha = 0.25 + intensity * 0.75;

      const jitterX = (Math.random() - 0.5) * 1.2;
      const jitterY = (Math.random() - 0.5) * 1.2;

      context.beginPath();
      context.arc(x + jitterX, y + jitterY, radius, 0, Math.PI * 2);
      context.fillStyle = colorScale(d.co2);
      context.globalAlpha = alpha;
      context.fill();
    });

    context.globalAlpha = 1;

    if (focusLon != null && focusLat != null && !inCinematic) {
      const focusCoords = projection([focusLon, focusLat]);
      if (focusCoords) {
        const fx = focusCoords[0];
        const fy = focusCoords[1];
        const haloRadius = r * 0.8;

        context.save();
        context.beginPath();
        context.arc(cx, cy, r, 0, Math.PI * 2);
        context.clip();

        const haloGrad = context.createRadialGradient(
          fx,
          fy,
          0,
          fx,
          fy,
          haloRadius
        );
        haloGrad.addColorStop(0, "rgba(56, 189, 248, 0.45)");
        haloGrad.addColorStop(1, "rgba(56, 189, 248, 0)");

        context.fillStyle = haloGrad;
        context.beginPath();
        context.arc(fx, fy, haloRadius, 0, Math.PI * 2);
        context.fill();

        context.restore();

        if (activeRegionLabel) {
          const labelX = fx;
          const labelY = fy + 8;

          context.save();
          context.font = "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.shadowColor = "rgba(0,0,0,0.7)";
          context.shadowBlur = 3;

          context.lineTo(labelX - 6, labelY);
          context.fillStyle = "rgba(226, 232, 240, 0.92)";
          context.fillText(activeRegionLabel, labelX, labelY);

          context.restore();
        }
      }
    }
  }




if (countries) {
  context.beginPath();
  context.strokeStyle = "rgba(148, 163, 184, 0.25)";
  context.lineWidth = 0.4;
  path(graticule);
  context.stroke();

  context.fillStyle = "rgba(0,0,0,0)";
  context.strokeStyle = "rgba(148, 163, 184, 0.85)";
  context.lineWidth = inCinematic ? 1.0 : 0.6;

  context.beginPath();
  path(countries);
  context.fill();
  context.stroke();
}


}

window.addEventListener("resize", resizeCanvas);
const CO2_MIN = 0;

const OCEAN_COLOR = "#020b1f";
const ATMOS_INNER = "rgba(56, 189, 248, 0.18)";
const ATMOS_OUTER = "rgba(15, 23, 42, 0)";

let focusLon = null;
let focusLat = null;

let colorScale = d3
  .scaleLinear()
  .range(["#020b1f", "#38bdf8", "#f97316"])
  .clamp(true);


function updateYear(csvFile) {
  function applyGlobeData(data) {
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
  }

  if (globeCache[csvFile]) {
    applyGlobeData(globeCache[csvFile]);
    return;
  }

  d3.csv(csvFile)
    .then((data) => {
      console.log("Loaded rows:", data.length, "from", csvFile);
      globeCache[csvFile] = data;
      applyGlobeData(data);
    })
    .catch((err) => {
      console.error("Error loading CSV", csvFile, err);
    });
}


const stepViews = {
  "step-1880": { lon: 18, lat: 2 },
  "step-1908": { lon: 42, lat: 27 },
  "step-1930": { lon: 5, lat: 50 },
  "step-1945": { lon: 138, lat: 36 },
  "step-1952": { lon: -0, lat: 51 },
  "step-2014": { lon: -120, lat: 30 },
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

function drawRegionChart(regionName, chartDiv, data, eventYear) {
  chartDiv.innerHTML = "";

  const parsedData = data.map((d) => ({
    time: +d.year,
    date: new Date(+d.year, 0, 1),
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

  scroller
    .setup({
      step: ".step",
      offset: 0.2,
    })
    .onStepEnter(async ({ element }) => {
      if (!hasStartedStory) return;

      focusLon = null;
      focusLat = null;

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

      const block = element.closest(".step-block");
      document.querySelectorAll(".step-block").forEach((b) => {
        b.classList.remove("is-active");
      });
      if (block) block.classList.add("is-active");

      collapseRacePanel();
      hideIntroCards();
      document.body.classList.remove("cinematic-mode");

      resizeCanvas();

      isEarthVisible = true;

      warpTarget = 0;
      warpFactor = 0;
      starTargetAlpha = 0;
      starGlobalAlpha = 0;

      const id = element.id;
      const view = stepViews[id];
      if (view) {
        animateGlobeTo(view.lon, view.lat, 1600);
        focusLon = view.lon;
        focusLat = view.lat;
        activeRegionLabel = element.dataset.region || "";
      }


      const globeFile = element.dataset.globeFile;
      const chartFile = element.dataset.chartFile;
      const region = element.dataset.region;
      const year = +element.dataset.year;

      if (globeFile) {
        updateYear(globeFile);
      }

      if (chartFile && region) {
        const chartData = await d3.csv(chartFile);
        const chartDiv = block.querySelector(".chart");
        drawRegionChart(region, chartDiv, chartData, year);
      }
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

  if (hasWarped) {
    return;
  }

  isInStory = true;
  isWarping = true;

  const firstTime = !hasStartedStory;
  hasStartedStory = true;

  if (firstTime) {
    lockScroll();
  }

  hideIntroCards();
  clearWarpTimers();

  intro.classList.add("slide-up");

  isEarthVisible = false;
  draw();

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

  warpTarget = WARP_BURST;
  const WARP_DURATION = 1300;
  const DECEL_DURATION = 700;
  const ZOOM_DURATION = 1200;

  warpTimeout = setTimeout(() => {
    warpTarget = WARP_CRUISE;

    slowTimeout = setTimeout(() => {
      warpTarget = 0.05;
      starTargetAlpha = 0.3;

      scrolly.classList.add("visible");
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
          isEarthVisible = true;
          draw();

          warpTarget = WARP_IDLE;
          isWarping = false;

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

const beginBtn = document.getElementById("begin-btn");
if (beginBtn) {
  beginBtn.addEventListener("click", () => {
    enterStory();
  });
}

const proceedBtn = document.getElementById("proceed-btn");
if (proceedBtn) {
  proceedBtn.addEventListener("click", () => {
    unlockScroll();

    document.body.classList.remove("cinematic-mode");
    document.body.classList.remove("story-intro-active");

    const introCardsEl = document.getElementById("intro-cards");
    if (introCardsEl) {
      introCardsEl.style.display = "none";
    }

    const firstStepBlock = document.querySelector(
      ".step-block:not(.ghost-step)"
    );
    if (firstStepBlock) {
      const rect = firstStepBlock.getBoundingClientRect();
      const offset = window.innerHeight * 0.2;
      const targetTop = window.pageYOffset + rect.top - offset;

      window.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });
    }
  });
}




lockScroll();
window.scrollTo(0, 0);
