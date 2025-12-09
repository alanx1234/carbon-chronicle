const canvas = document.getElementById("globe");

const spaceCanvas = document.getElementById("space-bg");
const spaceCtx = spaceCanvas.getContext("2d");

let spaceWidth = window.innerWidth;
let spaceHeight = window.innerHeight;
let scrollTimeout = null;
let userIsScrolling = false;
let isStoryActive = false; 
let hasExitedIntro = false;

let stars = [];
let starsPaused = false;
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
const stepColorDomains = {};
let dotTransitionAnimating = false;
let dotTransition = 1;

let countries;
let plotData = [];
let targetScale = 250;

let isEarthVisible = true;
let isInStory = false;
let isWarping = false;
let isZooming = false;
let dotAlpha = 1.0;
let starsInitialized = false;
let isOutroWarp = false;

let currentYearMode = "event"; // "event" or "after"
let currentStepElement = null; 


// === Manual rotation for main globe ===
let mainGlobeDragging = false;
let mainGlobeDragStart = null;
let mainGlobeRotationStart = null;
let mainGlobeDragRafPending = false;

function scheduleMainGlobeDraw() {
  if (mainGlobeDragRafPending) return;
  mainGlobeDragRafPending = true;
  requestAnimationFrame(() => {
    mainGlobeDragRafPending = false;
    draw();
  });
}

function beginMainGlobeDrag(clientX, clientY) {
  if (isWarping || isZooming || !isEarthVisible) return;

  mainGlobeDragging = true;
  mainGlobeDragStart = [clientX, clientY];
  mainGlobeRotationStart = projection.rotate();

  // If an auto-rotation tween is running (from scroll), cancel it
  if (activeRotationTween && activeRotationTween.cancel) {
    activeRotationTween.cancel = true;
    activeRotationTween = null;
  }

  canvas.style.cursor = "grabbing";
}

function moveMainGlobeDrag(clientX, clientY) {
  if (!mainGlobeDragging || !mainGlobeRotationStart) return;

  const dx = clientX - mainGlobeDragStart[0];
  const dy = clientY - mainGlobeDragStart[1];

  const sensitivity = 0.3; // tweak if you want slower/faster spin

  const newRotate = [
    mainGlobeRotationStart[0] + dx * sensitivity, // yaw
    mainGlobeRotationStart[1] - dy * sensitivity, // pitch
    mainGlobeRotationStart[2],                    // keep roll
  ];

  projection.rotate(newRotate);
  scheduleMainGlobeDraw();
}

function endMainGlobeDrag() {
  if (!mainGlobeDragging) return;
  mainGlobeDragging = false;
  mainGlobeDragStart = null;
  mainGlobeRotationStart = null;
  canvas.style.cursor = "";
}


const DEV_MODE = false;

// === Historical events per region (for annotations) ===
const REGION_EVENTS = {
  "Africa": [
    { year: 1880, label: "Scramble for\nAfrica" },
    { year: 1991, label: "Sierra Leone civil war\n& the blood diamonds" }
  ],
  "Middle East": [
    { year: 1908, label: "Mass drilling\nof oil" },
    { year: 1991, label: "Gulf War Kuwaiti\noil fires" }
  ],
  "Japan": [
    { year: 1945, label: "World's first atomic\nbomb dropped on Hiroshima" }
  ],
  "United Kingdom": [
    { year: 1952, label: "Great Smog\nof London" }
  ],
  "Vietnam": [
    { year: 1955, label: "Vietnam War" }
  ]
};

const BENEFICIARY_REGIONS_BY_STEP = {
  "step-1880": [
    { label: "United States", lat: 39, lon: -98 },
    { label: "Western Europe", lat: 50, lon: 10 },
  ],
  "step-1908": [
    { label: "United Kingdom", lat: 54, lon: -2 },
    { label: "United States", lat: 39, lon: -98 },
  ],
  "step-1945": [{ label: "United States", lat: 39, lon: -98 }],
  "step-1952": [
    // just the UK halo as the exploited/beneficiary region, no extra labels
  ],
  "step-1955": [
    { label: "United States", lat: 39, lon: -98 },
    { label: "France", lat: 46, lon: 2 },
  ],
};


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

  if (starsPaused) {
    lastTime = timestamp; // avoid a huge delta when we resume
    requestAnimationFrame(renderSpace);
    return;
  }


  if (!lastTime) lastTime = timestamp;
  const deltaTime = (timestamp - lastTime) / 16.66;
  lastTime = timestamp;

  const inStorySteps = isStoryActive;

  if (!isInStory) {
    // INTRO MODE
    warpTarget = WARP_IDLE;
    starTargetAlpha = 1;
  } else if (isWarping) {
    // WARP MODE
    // do nothing — warpTarget already controlled by enterStory()
  } else {
    // STORY MODE
    warpTarget = 0;
    starTargetAlpha = 0;
  }

spaceCtx.fillStyle = "rgba(2,6,23,0.9)";
spaceCtx.fillRect(0, 0, spaceWidth, spaceHeight);

  warpFactor += (warpTarget - warpFactor) * 0.1 * deltaTime;
  starGlobalAlpha += (starTargetAlpha - starGlobalAlpha) * 0.08 * deltaTime;

  warpHuePhase += warpFactor * 0.12 * deltaTime;

  if (isInStory && !isWarping) {
  spaceCtx.fillStyle = "rgba(2, 6, 35, 1)";
  spaceCtx.fillRect(0, 0, spaceWidth, spaceHeight);

  // keep the loop alive so when we flip back to intro,
  // stars can start drawing again
  requestAnimationFrame(renderSpace);
  return;
}


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

      // Intro warp = cool blue, outro warp = warmer magenta/pink
      let baseHue;
      if (isOutroWarp) {
        // reverse warp → more cosmic purple / magenta
        baseHue = 295 + 40 * Math.sin(warpHuePhase * 0.6);
      } else {
        // original intro warp look
        baseHue = 220 + 80 * Math.sin(warpHuePhase * 0.5);
      }

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
  const introCardsEl = document.getElementById("intro-cards");
  if (introCardsEl) {
    introCardsEl.style.display = "flex"; // <-- make sure it's visible again
  }

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
    let raceStartTimeout = null;
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

      if (raceInterval) raceInterval.stop();
      if (raceStartTimeout) clearTimeout(raceStartTimeout);

      year = raceYears[currentYearIndex];
      renderYear(year, raceYearDataByYear.get(year));
      yearLabel.text(year);

      raceStartTimeout = setTimeout(() => {
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
      }, 0);
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

  // FIXED globe size – no per-step zoom multiplier
  const zoomMult = currentStepZoomMultiplier || 1;
  setProjection(targetScale * zoomMult, width, height);
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

  if (!isZooming && plotData.length && isEarthVisible) {
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
      // 1) Cull points on the back side of the globe
      if (!isPointOnFrontHemisphere(d.lat, d.lon)) return;

      // 2) Then project + do your existing circle clip
      const coords = projection([d.lon, d.lat]);
      if (!coords) return;

      const x = coords[0];
      const y = coords[1];
      const dx = x - cx;
      const dy = y - cy;
      
      if (dx * dx + dy * dy > r * r) return;

      const intensity = Math.min(1, d.co2 / maxVal);
      const baseRadius = 1.4 + intensity * 1.7;

      const w = d.weight != null ? d.weight : 1;
      const motionScale = 0.85 + 0.15 * dotTransition;
      const radius = baseRadius * motionScale * (0.7 + 0.3 * w);

      const alpha = (0.25 + intensity * 0.75) * dotTransition * w;

      const jitterX = d.jitterX;
      const jitterY = d.jitterY;

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
  
        // Only show label once rotation tween is finished
        if (activeRegionLabel && !activeRotationTween) {
          context.save();
          context.font =
            "500 15px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.shadowColor = "rgba(15, 23, 42, 0.85)";
          context.shadowBlur = 6;
          context.fillStyle = "#e5e7eb";

          if (activeRegionLabel === "Africa") {
            // AFRICA: label right in the middle, no line
            const labelX = fx;
            const labelY = fy;
            context.fillText(activeRegionLabel, labelX, labelY);
          } else {
            // Everyone else: offset label + leader line

            // vector from globe center → region center
            const vx = fx - cx;
            const vy = fy - cy;
            const dist = Math.sqrt(vx * vx + vy * vy);

            // how far to push the label away from the region
            const offset = r * 0.22; // tweak if needed

            let labelX, labelY;

            if (dist < r * 0.05) {
              // if the focus is basically at the center, shove label to the right
              labelX = fx + offset;
              labelY = fy;
            } else {
              const ux = vx / (dist || 1);
              const uy = vy / (dist || 1);
              labelX = fx + ux * offset;
              labelY = fy + uy * offset;
            }

            // leader line
            context.beginPath();
            context.moveTo(fx, fy);
            context.lineTo(labelX, labelY);
            context.strokeStyle = "rgba(148, 163, 184, 0.85)";
            context.lineWidth = 0.8;
            context.stroke();

            // text
            context.fillText(activeRegionLabel, labelX, labelY);
          }

                    context.restore();

                    // --- Beneficiary markers: same pointer-style labels, no halo ---
                    if (currentStepElement && !inCinematic) {
                      const stepId = currentStepElement.id;
                      const beneficiaries = BENEFICIARY_REGIONS_BY_STEP[stepId];

                      if (beneficiaries && beneficiaries.length) {
                        beneficiaries.forEach((b) => {
                          // Only draw if the point is on the visible hemisphere
                          if (!isPointOnFrontHemisphere(b.lat, b.lon)) return;

                          const coords = projection([b.lon, b.lat]);
                          if (!coords) return;

                          const bx = coords[0];
                          const by = coords[1];

                          // Make sure it's on the disc, not off the edge
                          const dx = bx - cx;
                          const dy = by - cy;
                          if (dx * dx + dy * dy > r * r) return;

                          context.save();
                          context.font =
                            "500 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
                          context.textAlign = "center";
                          context.textBaseline = "middle";
                          context.shadowColor = "rgba(15, 23, 42, 0.85)";
                          context.shadowBlur = 5;
                          context.fillStyle = "#e5e7eb";

                          // Pointer math: same idea as the main event label
                          const vx = bx - cx;
                          const vy = by - cy;
                          const dist = Math.sqrt(vx * vx + vy * vy);

                          const offset = r * 0.22; // same as activeRegionLabel

                          let labelX, labelY;
                          if (dist < r * 0.05) {
                            // If close to center, shove label to the right
                            labelX = bx + offset;
                            labelY = by;
                          } else {
                            const ux = vx / (dist || 1);
                            const uy = vy / (dist || 1);
                            labelX = bx + ux * offset;
                            labelY = by + uy * offset;
                          }

                          // leader line
                          context.beginPath();
                          context.moveTo(bx, by);
                          context.lineTo(labelX, labelY);
                          context.strokeStyle = "rgba(148, 163, 184, 0.75)";
                          context.lineWidth = 0.7;
                          context.stroke();

                          // text
                          context.fillText(b.label, labelX, labelY);

                          context.restore();
                        });
                      }
                    }

        }
      }
    }
  }




if (!isZooming && countries) {
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
}}



window.addEventListener("resize", resizeCanvas);
const CO2_MIN = 0;

const OCEAN_COLOR = "#020b1f";
const ATMOS_INNER = "rgba(56, 189, 248, 0.18)";
const ATMOS_OUTER = "rgba(15, 23, 42, 0)";

let focusLon = null;
let focusLat = null;

let colorScale = d3
  .scaleLinear()
  .range(["#020617", "#38bdf8", "#f97316"])
  .clamp(true);

function regionWeight(p) {
  return 1;
}

function updateYear(csvFile) {
  function applyGlobeData(data) {
    // 1) Map raw rows to objects with region weights
    const yearData = data.map((d) => {
      const obj = {
        lat: +d.lat,
        lon: +d.lon,
        co2: +d.fco2antt,
      };
      obj.weight = regionWeight(obj);
      return obj;
    });

    // 2) Choose color scale: fixed per-step if available,
    // otherwise fall back to per-year scaling
    const stepId = currentStepElement ? currentStepElement.id : null;
    const fixedDomain =
      stepId && stepColorDomains[stepId] ? stepColorDomains[stepId] : null;

    if (fixedDomain) {
      // Use the shared domain for this step (event +10y)
      colorScale.domain(fixedDomain);
    } else {
      let scaleSample = yearData.filter((d) => d.co2 > 0 && d.weight > 0.2);

      if (!scaleSample.length) {
        // Fallback: use all positive values if something went weird
        scaleSample = yearData.filter((d) => d.co2 > 0);
      }

      const landValues = scaleSample.map((d) => d.co2).sort(d3.ascending);

      if (landValues.length) {
        const q80 = d3.quantile(landValues, 0.8);
        const q95 = d3.quantile(landValues, 0.95);
        colorScale.domain([0, q80, q95]);
      }
    }

    // 3) Only keep points with some visible weight
    let drawSource = yearData.filter((d) => d.weight > 0.01);

    const BIN_SIZE = 1;
    const binnedData = d3.rollup(
      drawSource,
      (v) => ({
        co2: d3.mean(v, (d) => d.co2),
        weight: d3.mean(v, (d) => d.weight),
      }),
      (d) => Math.round(d.lat / BIN_SIZE) * BIN_SIZE,
      (d) => Math.round(d.lon / BIN_SIZE) * BIN_SIZE
    );

    plotData = [];
    binnedData.forEach((lons, lat) => {
      lons.forEach((val, lon) => {
        plotData.push({
          lat: +lat,
          lon: +lon,
          co2: val.co2,
          weight: val.weight,
          // precompute a tiny jitter once so we don't call Math.random in draw()
          jitterX: (Math.random() - 0.5) * 1.2,
          jitterY: (Math.random() - 0.5) * 1.2,
        });
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
function animateDotTransition(onMidpoint) {
  if (dotTransitionAnimating) {
    // If a transition is in progress, just call the mid-callback immediately
    if (onMidpoint) onMidpoint();
    return;
  }

  dotTransitionAnimating = true;
  const duration = 520;
  const start = performance.now();
  let midCalled = false;

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);

    if (t < 0.5) {
      // fade/shrink out
      dotTransition = 1 - t * 2;
    } else {
      // fade/shrink in
      dotTransition = (t - 0.5) * 2;

      if (!midCalled && onMidpoint) {
        midCalled = true;
        onMidpoint();
      }
    }

    draw();

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      dotTransitionAnimating = false;
      dotTransition = 1;
      draw();
    }
  }

  requestAnimationFrame(frame);
}
function isPointOnFrontHemisphere(latDeg, lonDeg) {
  // d3-geo convention:
  // projection.rotate() = [lambda0, phi0, gamma]
  // Visible center on the globe is actually at (-lambda0, -phi0).
  const [lambda0, phi0] = projection.rotate();

  // Actual center lat/lon in radians
  const λc = (-lambda0 * Math.PI) / 180;
  const φc = (-phi0 * Math.PI) / 180;

  // Point we’re testing
  const λ = (lonDeg * Math.PI) / 180;
  const φ = (latDeg * Math.PI) / 180;

  // cos(c) for angular distance between (lat,lon) and the current center
  // > 0  → front hemisphere relative to that center
  const cosc =
    Math.sin(φc) * Math.sin(φ) + Math.cos(φc) * Math.cos(φ) * Math.cos(λ - λc);

  return cosc > 0;
}


function getGlobeFileForStep(stepEl) {
  if (!stepEl) return null;

  const base = stepEl.dataset.globeFile;
  const after = stepEl.dataset.globeFileAfter;

  if (currentYearMode === "after" && after) {
    return after;
  }
  return base || null;
}
async function ensureStepColorDomain(stepEl) {
  if (!stepEl) return null;

  const stepId = stepEl.id || stepEl.dataset.stepId;
  if (!stepId) return null;

  // If we've already computed it, reuse
  if (stepColorDomains[stepId]) {
    return stepColorDomains[stepId];
  }

  const baseFile = stepEl.dataset.globeFile;
  const afterFile = stepEl.dataset.globeFileAfter;
  const files = [baseFile, afterFile].filter(Boolean);

  // If there's no data at all, nothing to do
  if (!files.length) return null;

  // Load all the files (using globeCache if available)
  const datasets = await Promise.all(
    files.map((file) => {
      if (globeCache[file]) return Promise.resolve(globeCache[file]);
      return d3.csv(file).then((data) => {
        globeCache[file] = data;
        return data;
      });
    })
  );

  // Collect regional values across BOTH years
  let values = [];

  datasets.forEach((data) => {
    data.forEach((d) => {
      const obj = {
        lat: +d.lat,
        lon: +d.lon,
        co2: +d.fco2antt,
      };
      obj.weight = regionWeight(obj);

      // Only sample inside the focused region
      if (obj.co2 > 0 && obj.weight > 0.2) {
        values.push(obj.co2);
      }
    });
  });

  // Fallback: if something went weird with weights, use all positive values
  if (!values.length) {
    datasets.forEach((data) => {
      data.forEach((d) => {
        const co2 = +d.fco2antt;
        if (co2 > 0) values.push(co2);
      });
    });
  }

  if (!values.length) return null;

  values.sort(d3.ascending);
  const q85 = d3.quantile(values, 0.85);
  const q90 = d3.quantile(values, 0.95);
  const domain = [0, q85, q90];

  stepColorDomains[stepId] = domain;
  return domain;
}



const stepViews = {
  // Africa – same
  "step-1880": { lon: 18, lat: 2 },

  // Middle East – move the focus north-east to where the emissions band actually is
  // (around northern Iran / Caspian / Iraq–Turkey area)
  "step-1908": { lon: 45, lat: 35 },

  // Belgium – same
  "step-1930": { lon: 5, lat: 50 },

  // Japan – nudge slightly north so the halo hugs the main islands
  "step-1945": { lon: 138, lat: 38 },

  // UK – move a bit west/north so it covers the whole island group
  "step-1952": { lon: -2, lat: 54 },

  // Vietnam – shift slightly north
  "step-1955": { lon: 107, lat: 16 },

  // 2014 Africa context
  "step-2014": { lon: 18, lat: 2 },
};

const stepZoomByStep = {
  "step-1880": 1.15, // Africa – mild zoom
  "step-1908": 1.6, // Middle East – tighter region
  "step-1930": 1.8, // Belgium (if re-enabled)
  "step-1945": 1.8, // Japan
  "step-1952": 1.8, // UK
  "step-1955": 1.8, // Vietnam
  "step-2014": 1.15, // 2014 Africa context (if used)
};

let currentStepZoomMultiplier = 1;

const regionMaskByStep = {
  // Africa – wide, since it's a whole continent
  "step-1880": {
    latMin: -35,
    latMax: 20,
    lonMin: -20,
    lonMax: 50,
  },

  // Middle East – avoid most of Europe & N. Africa
  "step-1908": {
    latMin: 15,
    latMax: 40,
    lonMin: 30,
    lonMax: 65,
  },

  // Belgium – small patch in Western Europe
  "step-1930": {
    latMin: 46,
    latMax: 56,
    lonMin: -2,
    lonMax: 10,
  },

  // Japan – try to exclude Korea / China
  "step-1945": {
    latMin: 28,
    latMax: 46,
    lonMin: 130,
    lonMax: 147,
  },

  // United Kingdom – just the islands
  "step-1952": {
    latMin: 48,
    latMax: 60,
    lonMin: -11,
    lonMax: 4,
  },

  // Vietnam – tighter around Vietnam itself
  "step-1955": {
    latMin: 8,
    latMax: 24,
    lonMin: 102,
    lonMax: 110,
  },

  // 2014 Africa context – same as Africa bounds
  "step-2014": {
    latMin: -35,
    latMax: 20,
    lonMin: -20,
    lonMax: 50,
  },
};


const regionRadiusByStep = {
  "step-1880": 40, // Africa – keep wide (whole continent)

  // Middle East – narrower so we don’t grab as much of Europe / N. Africa
  "step-1908": 20,

  "step-1930": 12, // Belgium – slightly smaller

  // Japan – smaller so we don’t include mainland Asia
  "step-1945": 10,

  // UK – a bit smaller but still enough to cover the islands
  "step-1952": 10,

  // Vietnam – much tighter so it doesn’t pull in half of SE Asia
  "step-1955": 10,

  "step-2014": 40, // Africa context
};
const regionCountriesByStep = {
  // Middle East oil story
  "step-1908": [
    "Iran",
    "Iraq",
    "Saudi Arabia",
    "Kuwait",
    "United Arab Emirates",
    "Qatar",
    "Bahrain",
    "Oman",
    "Syria",
    "Jordan",
    "Israel",
    "Lebanon",
  ],

  // Japan nuclear/testing story
  "step-1945": ["Japan"],

  // UK smog story
  "step-1952": ["United Kingdom", "Ireland"],

  // Vietnam war story
  "step-1955": ["Vietnam"],
};

let activeRotationTween = null;

function animateGlobeTo(lon, lat, duration = 1600) {
  if (activeRotationTween && activeRotationTween.cancel) {
    activeRotationTween.cancel = true;
  }

  const startRotation = projection.rotate();
  const endRotation = [-lon, -lat, startRotation[2]];

  const rotInterp = d3.interpolate(startRotation, endRotation);
  const ease = d3.easeCubicInOut;
  const startTime = performance.now();

  const state = { cancel: false };
  activeRotationTween = state;

  function frame(now) {
    if (state.cancel) return;
    const t = Math.min((now - startTime) / duration, 1);
    const k = ease(t);

    projection.rotate(rotInterp(k));
    draw();

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      // tween is finished – allow label to appear
      activeRotationTween = null;
      draw();
    }
  }

  requestAnimationFrame(frame);
}





function drawRegionChart(regionName, chartDiv, data, eventYearFromStep) {
  // Clear any previous chart in this container
  chartDiv.innerHTML = "";

  // --------- Prepare data ----------
  const parsedData = data.map((d) => ({
    year: +d.year,
    value: +d[regionName],
  }));

  const cleaned = parsedData.filter(
    (d) => Number.isFinite(d.year) && Number.isFinite(d.value)
  );
  if (!cleaned.length) {
    console.warn("[regions] no valid data for region", regionName);
    return;
  }

  // --------- Event metadata ----------
  const events = REGION_EVENTS[regionName] || (
    eventYearFromStep ? [{ year: eventYearFromStep, label: null }] : []
  );

  // Use the *first* event year to split the line before/after
  const splitYear = events.length ? events[0].year : eventYearFromStep;

  // Palette: neutral pre-event, orange post-event (color-blind-friendly)
  const preColor  = "#4b5563";  // slate gray
  const postColor = "#c026d3";  // magenta

  // --------- Dimensions ----------
  const containerWidth = chartDiv.clientWidth || 500;
  const svgHeight = 280;  // slightly taller than before

  const margin = { top: 48, right: 24, bottom: 40, left: 64 };
  const width = containerWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  // --------- Create SVG ----------
  const svg = d3
    .select(chartDiv)
    .append("svg")
    .attr("width", containerWidth)
    .attr("height", svgHeight)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // --------- Scales ----------
  const x = d3
    .scaleLinear()
    .domain(d3.extent(cleaned, (d) => d.year))
    .range([0, width]);

  const maxVal = d3.max(cleaned, (d) => d.value) * 1.05;

  const y = d3
    .scaleLinear()
    .domain([0, maxVal])
    .nice()
    .range([height, 0]);

  // --------- Gridlines ----------
  const yGrid = d3
    .axisLeft(y)
    .ticks(5)
    .tickSize(-width)
    .tickFormat("");

  svg
    .append("g")
    .attr("class", "grid")
    .call(yGrid)
    .selectAll("line")
    .attr("stroke", "#000")
    .attr("stroke-opacity", 0.12)
    .attr("stroke-dasharray", "2,2");

  // --------- Axes ----------
  const xAxis = d3.axisBottom(x).ticks(6).tickFormat(d3.format("d"));
  const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format(".2s"));

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(xAxis);

  svg.append("g").call(yAxis);

  svg.selectAll(".domain, .tick line").attr("stroke", "#444");
  svg.selectAll(".tick text").attr("fill", "#444");

  // Axis labels
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -margin.left + 18)
    .attr("text-anchor", "middle")
    .text("Carbon Emissions (MtC/year)");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 8)
    .attr("text-anchor", "middle")
    .text("Year");

  // --------- Lines (pre vs post splitYear) ----------
  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.value))
    .curve(d3.curveMonotoneX);

  const preEvent = cleaned.filter((d) => d.year <= splitYear);
  const postEvent = cleaned.filter((d) => d.year >= splitYear);

  // Before event
  svg
    .append("path")
    .datum(preEvent)
    .attr("fill", "none")
    .attr("stroke", preColor)
    .attr("stroke-width", 2)
    .attr("d", line);

  // After event
  svg
    .append("path")
    .datum(postEvent)
    .attr("fill", "none")
    .attr("stroke", postColor)
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", null)
    .attr("d", line);

  // --------- Event annotations (vertical line + big dot + label) ----------
  const [xMin, xMax] = x.domain();
  const midYear = (xMin + xMax) / 2;

  events.forEach((ev, idx) => {
    // vertical dashed line
    svg
      .append("line")
      .attr("x1", x(ev.year))
      .attr("x2", x(ev.year))
      .attr("y1", 0)
      .attr("y2", height)
      .attr("stroke", postColor)
      .attr("stroke-width", 1.8)
      .attr("stroke-dasharray", "4,4")
      .attr("opacity", 0.9);

    // enlarged circle at data point (if we have that year)
    const point = cleaned.find((d) => d.year === ev.year);
    if (point) {
      svg
        .append("circle")
        .attr("cx", x(point.year))
        .attr("cy", y(point.value))
        .attr("r", 6)
        .attr("fill", "#f7f1e1")
        .attr("stroke", postColor)
        .attr("stroke-width", 2);
    }

    // ----- multi-line label with consistent bottom alignment -----
    if (ev.label) {
      const anchor = "middle";
      const baseX = x(ev.year);
      const lines = ev.label.split("\n");

      const lineHeight = 11;         // vertical spacing between lines
      const desiredBottomOffset = 4; // px above the top axis (y = 0)

      // We want the *bottom* line’s baseline to sit at -desiredBottomOffset
      const bottomBaselineY = -desiredBottomOffset;

      // Compute the baseline for the FIRST line so the LAST ends up at bottomBaselineY
      const firstLineBaselineY =
        bottomBaselineY - (lines.length - 1) * lineHeight;

      const text = svg
        .append("text")
        .attr("class", "event-label")
        .attr("x", baseX)
        .attr("y", firstLineBaselineY)
        .attr("text-anchor", anchor)
        .attr("alignment-baseline", "alphabetic"); // baseline alignment

      lines.forEach((line, i) => {
        text
          .append("tspan")
          .attr("x", baseX)
          .attr("dy", i === 0 ? 0 : lineHeight)
          .text(line);
      });
    }
  });
}

async function initAllRegionCharts() {
  const steps = document.querySelectorAll(".step[data-chart-file]");
  console.log("[regions] found steps:", steps.length);

  if (!steps.length) return;

  const fileCache = {};

  for (const step of steps) {
    // Read attributes off the step
    let chartFile = step.dataset.chartFile;
    const region = step.dataset.region;
    const year   = +step.dataset.year;

    console.log("[regions] step:", {
      id: step.id,
      chartFile,
      region,
      year,
    });

    if (!chartFile || !region) {
      console.warn("[regions] skipping step – missing chartFile or region");
      continue;
    }

    // DEBUG: force chartFile if needed
    // chartFile = "regions_co2.csv";

    // Load + cache the CSV
    if (!fileCache[chartFile]) {
      console.log("[regions] loading CSV:", chartFile);
      try {
        fileCache[chartFile] = await d3.csv(chartFile);
        console.log(
          "[regions] loaded",
          fileCache[chartFile].length,
          "rows from",
          chartFile
        );
      } catch (err) {
        console.error("[regions] FAILED to load CSV", chartFile, err);
        continue; // don’t try to draw if data failed to load
      }
    }

    const data = fileCache[chartFile];

    const block = step.closest(".step-block");
    if (!block) {
      console.warn("[regions] no parent .step-block for step", step.id);
      continue;
    }

    const chartDiv = block.querySelector(".chart");
    if (!chartDiv) {
      console.warn("[regions] no .chart found inside step-block for", step.id);
      continue;
    }

    if (chartDiv.dataset.initialized === "true") {
      console.log("[regions] chart already initialized for", region);
      continue;
    }

    console.log(
      "[regions] drawing chart:",
      region,
      "rows:",
      data.length,
      "eventYear:",
      year
    );
    drawRegionChart(region, chartDiv, data, year);
    chartDiv.dataset.initialized = "true";
  }
}



async function handleStepEnter(element) {
  if (!element) return;

  const block = element.closest(".step-block");
  document.querySelectorAll(".step-block").forEach((b) => {
    b.classList.remove("is-active");
  });
  if (block) block.classList.add("is-active");

  collapseRacePanel();
  hideIntroCards();
  document.body.classList.remove("cinematic-mode");

  if (!isWarping && !isZooming) {
    resizeCanvas();
  }

  isEarthVisible = true;

  const id = element.id;
  const view = stepViews[id];
  if (view) {
    // Rotate to center this region, but keep globe size fixed
    animateGlobeTo(view.lon, view.lat, 1600);
    focusLon = view.lon;
    focusLat = view.lat;
    activeRegionLabel = element.dataset.region || "";
  }

  // Track active step for the toggle
  currentStepElement = element;

  // Always reset toggle to the event year when entering ANY step
  currentYearMode = "event";
  if (yearToggleEl) {
    yearToggleButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === "event");
    });

    // Show or hide the toggle depending on whether this step has an "after" file
    if (element.dataset.globeFileAfter) {
      yearToggleEl.classList.add("visible");
    } else {
      yearToggleEl.classList.remove("visible");
    }
  }

  // Ensure the shared color domain (event +5y) is computed for this step
  await ensureStepColorDomain(element);

  // Pick appropriate file based on current mode
  const globeFile = getGlobeFileForStep(element);
  const chartFile = element.dataset.chartFile;
  const region = element.dataset.region;
  const year = +element.dataset.year;

  if (globeFile) {
    updateYear(globeFile);
  }

  if (chartFile && region) {
    const chartDiv = block.querySelector(".chart");
    if (chartDiv && chartDiv.dataset.initialized !== "true") {
      const chartData = await d3.csv(chartFile);
      drawRegionChart(region, chartDiv, chartData, year);
      chartDiv.dataset.initialized = "true";
    }
  }
}

let lastStepBlock = null;
let hasShownFirstPage = false;

function triggerPageFlip(prevBlock, nextBlock, direction) {
  if (!nextBlock) return;

  const nextSheet = nextBlock.querySelector(".newspaper-sheet");
  if (!nextSheet) return;

  const forward = direction === "down";

  // --- FIRST TIME WE EVER SHOW A NEWSPAPER PAGE ---
  // or if Scrollama re-fires on the same block.
  if (!hasShownFirstPage || !prevBlock || prevBlock === nextBlock) {
    nextSheet.classList.remove(
      "page-flip-in-forward",
      "page-flip-in-back",
      "page-flip-out-forward",
      "page-flip-out-back"
    );
    nextSheet.classList.add("page-current");
    hasShownFirstPage = true;
    lastStepBlock = nextBlock;
    return; // <- no animation
  }

  // Clean up any old animation classes on the incoming sheet
  nextSheet.classList.remove(
    "page-flip-in-forward",
    "page-flip-in-back",
    "page-flip-out-forward",
    "page-flip-out-back"
  );

  // Mark this as the current page
  nextSheet.classList.add("page-current");

  // Animate the previous page flipping away
  if (prevBlock && prevBlock !== nextBlock) {
    const prevSheet = prevBlock.querySelector(".newspaper-sheet");
    if (prevSheet) {
      prevSheet.classList.remove(
        "page-flip-in-forward",
        "page-flip-in-back",
        "page-current"
      );

      const outClass = forward ? "page-flip-out-forward" : "page-flip-out-back";

      prevSheet.classList.add(outClass);

      prevSheet.addEventListener(
        "animationend",
        () => {
          prevSheet.classList.remove(
            outClass,
            "page-flip-in-forward",
            "page-flip-in-back"
          );
        },
        { once: true }
      );
    }
  }

  // Animate the new page flipping in
  const inClass = forward ? "page-flip-in-forward" : "page-flip-in-back";
  nextSheet.classList.add(inClass);

  nextSheet.addEventListener(
    "animationend",
    () => {
      nextSheet.classList.remove("page-flip-in-forward", "page-flip-in-back");
      // keep page-current
    },
    { once: true }
  );

  lastStepBlock = nextBlock;
}



d3.json("data/countries.json").then((world) => {
  countries = topojson.feature(world, world.objects.countries);
  
  resizeCanvas();
  draw();

  updateYear("data/1850_co.csv");

  const scroller = scrollama();

  scroller
    .setup({
      step: ".step-block.newspaper-page",
      offset: 0.5,
    })
      .onStepEnter(async ({ element, index, direction }) => {
    if (
      !isInStory ||
      isWarping ||
      isZooming ||
      document.body.classList.contains("cinematic-mode")
    ) {
      // If we're in warp / intro / race overlay, ignore step events
      return;
    }

    // Trigger page flip animation between last and current blocks
    triggerPageFlip(lastStepBlock, element, direction || "down");
    lastStepBlock = element;

    const stepEl = element.querySelector(".step");
    if (stepEl) {
      await handleStepEnter(stepEl);
    }
  });


  window.addEventListener("resize", () => {
    scroller.resize();
  });

  // charts always-on
  initAllRegionCharts();

  const firstBlock = document.querySelector(".step-block.newspaper-page");
  if (firstBlock) {
    const firstSheet = firstBlock.querySelector(".newspaper-sheet");
    if (firstSheet) {
      firstSheet.classList.add("page-current");
      lastStepBlock = firstBlock;
      hasShownFirstPage = true;
    }
  }
  
  if (DEV_MODE) {
    // Pretend we've already done the warp/year scene
    hasWarped = true;
    isInStory = true;
    isWarping = false;

    // Make sure we’re not in cinematic/intro state
    document.body.classList.remove("scroll-locked");
    document.body.classList.remove("cinematic-mode");

    if (intro) {
      intro.classList.add("slide-up"); // hide the big intro card
    }

    if (scrolly) {
      scrolly.classList.add("visible");
    }

    // Activate the first newspaper page + step
    const firstBlock = document.querySelector(".step-block.newspaper-page");
    if (firstBlock) {
      const firstStep = firstBlock.querySelector(".step");
      if (firstStep) {
        handleStepEnter(firstStep);
      }

      // Scroll so the first page sits nicely in view
      const rect = firstBlock.getBoundingClientRect();
      const offset = window.innerHeight * 0.2;
      const targetTop = window.pageYOffset + rect.top - offset;

      window.scrollTo({
        top: targetTop,
        behavior: "auto",
      });
    }

    // Make sure the globe is sized correctly
    resizeCanvas();
    draw();
  }
  setupConclusionButton();
});
const intro = document.querySelector(".intro");
const scrolly = document.getElementById("scrolly");

// === YEAR SEQUENCE (Steins;Gate-style world-line year gate) ===
const yearOverlay = document.getElementById("year-sequence-overlay");
const yearDisplay = document.getElementById("year-sequence-year");
const yearSubtitle = document.getElementById("year-sequence-subtitle");

function playYearSequence(onComplete) {
  if (!yearOverlay || !yearDisplay || !yearSubtitle) {
    if (onComplete) onComplete();
    return;
  }

  // Start overlay
  yearOverlay.classList.remove("fade-out");
  yearOverlay.classList.add("visible");

  // Initial state: present day
  yearDisplay.textContent = "2025";
  yearSubtitle.textContent = "Going back in time...";

  // 0.5s hold on 2025 before any shuffling
  const PRE_SCRAMBLE_HOLD = 500; // ms to pause on 2025
  const SCRAMBLE_DURATION = 1500; // ms of random digits
  const HOLD_FINAL_DURATION = 1400; // ms to hold on 1850
  const TICK = 60; // how fast digits flicker

  const digits = "0123456789";
  const startTime = performance.now();

  yearDisplay.classList.add("scrambling");

  const scrambleInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;

    // Phase 1: hold on 2025
    if (elapsed < PRE_SCRAMBLE_HOLD) {
      yearDisplay.textContent = "2025";
      return;
    }

    // Phase 2: shuffling digits
    if (elapsed < PRE_SCRAMBLE_HOLD + SCRAMBLE_DURATION) {
      let s = "";
      for (let i = 0; i < 4; i++) {
        s += digits[Math.floor(Math.random() * 10)];
      }
      yearDisplay.textContent = s;
      return;
    }

    // Phase 3: lock to 1850 and fade out
    clearInterval(scrambleInterval);
    yearDisplay.classList.remove("scrambling");

    // Lock in the target year
    yearDisplay.textContent = "1850";
    yearSubtitle.textContent = "The Dawn of the Carbon Age";

    // Hold for a moment, then fade out overlay
    setTimeout(() => {
      yearOverlay.classList.add("fade-out");

      if (onComplete) {
        onComplete();
      }

      // Remove classes after fade-out completes so we can reuse if needed
      setTimeout(() => {
        yearOverlay.classList.remove("visible", "fade-out");
      }, 700);
    }, HOLD_FINAL_DURATION);
  }, TICK);
}



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

function resetStarfieldForIntro() {
  // 1) Cancel any warp / fade timers
  clearWarpTimers();

  // 2) Reset story / warp flags
  isInStory = false;
  isWarping = false;
  isStoryActive = false;
  hasStartedStory = false;
  hasWarped = false;

  // 3) Reset warp / star params
  warpFactor = WARP_IDLE;
  warpTarget = WARP_IDLE;
  starGlobalAlpha = 1;
  starTargetAlpha = 1;
  warpHuePhase = 0;
  lastTime = 0;

  // 4) Fresh starfield
  initStars();

  // 5) Restore intro UI + classes (THIS is what makes stars visible again)
  document.body.classList.add("cinematic-mode");   // <- important
  document.body.classList.remove("story-intro-active");

  const introCardsEl = document.getElementById("intro-cards");
  if (introCardsEl) {
    introCardsEl.style.display = ""; // show again
  }

  if (intro) intro.classList.remove("slide-up");
  if (scrolly) scrolly.classList.remove("visible");
}



function enterStory() {
  if (isInStory || isWarping) return;
  // if (hasWarped) return;

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

  // keep Earth hidden for warp + black + year gate
  isEarthVisible = false;
  document.body.classList.add("cinematic-mode");
  draw();

  const scrollyTop = scrolly.offsetTop;
  window.scrollTo({
    top: scrollyTop,
    behavior: "auto",
  });
  if (!starsInitialized) {
    initStars();
    starsInitialized = true;
  }

  warpFactor = WARP_IDLE;
  starGlobalAlpha = 1;
  starTargetAlpha = 1;

  warpTarget = WARP_BURST;

  // --- TIMING KNOBS ---
  const WARP_DURATION = 1000; // initial burst
  const DECEL_DURATION = 800; // delay before we start the glide
  const GLIDE_BEFORE_FADE = 800; // stars still visible but slower
  const STAR_FADE_DURATION = 700; // time stars take to fade to 0
  const POST_FADE_DELAY = 200; // time sitting on black before year gate
  const ZOOM_DURATION = 700;

  // 1) Burst warp phase
  warpTimeout = setTimeout(() => {
    setTimeout(() => {
      isStoryActive = true;
    }, 200);

    // 2) Decel phase begins
    slowTimeout = setTimeout(() => {
      // Glide: slower warp, stars still visible
      warpTarget = 0.08; // small but non-zero so they still move
      starTargetAlpha = 0.9;
      dotAlpha = 0;
      isEarthVisible = false;
      draw();

      // 3) After some glide time, start the fade phase
      setTimeout(() => {
        // start fading the stars to 0 alpha while still in "warp" mode
        warpTarget = 0.02; // almost stopped
        starTargetAlpha = 0;

        // give them time to visually fade out
        setTimeout(() => {
          // now stars should basically be gone → switch to pure black
          isWarping = false; // renderSpace now just paints solid black
          isEarthVisible = false;
          draw();

          // short pause on black, then run the year gate
          setTimeout(() => {
            playYearSequence(() => {
              // After 2025 → scramble → 1850 finishes, zoom Earth in
              isZooming = true;
              isEarthVisible = true;

              const startScale = targetScale * 0.12;
              const endScale = targetScale * 0.9;

              projection.scale(startScale);
              draw();

              d3.transition()
                .duration(ZOOM_DURATION)
                .ease(d3.easeCubicOut)
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

                  scrolly.classList.add("visible");

                  warpTarget = WARP_IDLE;
                  starTargetAlpha = 0;

                  showIntroCards();
                });
            });
          }, POST_FADE_DELAY);
        }, STAR_FADE_DURATION);
      }, GLIDE_BEFORE_FADE);
    }, DECEL_DURATION);
  }, WARP_DURATION);
}

function leaveStory() {
  if (isWarping) return;

  // stop any warp timers
  clearWarpTimers();

  // story state
  isInStory = false;
  isWarping = false;
  isStoryActive = false;

  // put stars back into "intro" mode
  warpTarget = WARP_IDLE;   // 0.25
  warpFactor = WARP_IDLE;
  starTargetAlpha = 1;
  starGlobalAlpha = 1;
  warpHuePhase = 0;

  // UI state
  hideIntroCards();
  scrolly.classList.remove("visible");
  intro.classList.remove("slide-up");

  document.body.classList.remove("cinematic-mode");

  // We’re leaving the story → allow scrolling again here;
  // the back button will re-lock if needed.
  unlockScroll();

  resizeCanvas();
  draw();
}

function playOutroWarpToConclusion(onComplete) {
  // If we're already warping, just bail out and go straight to conclusion
  if (isWarping) {
    if (onComplete) onComplete();
    return;
  }

  // Flag this as the outro warp so streak colors change
  isOutroWarp = true;

  // We are still "in the story" during this warp
  isWarping = true;
  isStoryActive = false;

  // Put us into cinematic mode so the timeline UI fades away
  document.body.classList.add("cinematic-mode");

  // Hide the Earth during the warp so it feels like pure hyperspace
  isEarthVisible = false;
  draw();

  // Make sure stars are ready
  if (!starsInitialized) {
    initStars();
    starsInitialized = true;
  }

  // Start from black / no stars → then ramp into warp streaks
  warpFactor = 0.0;
  warpTarget = WARP_BURST; // big streaks, same constant as intro warp
  starGlobalAlpha = 0.0;
  starTargetAlpha = 1.0; // fade stars in during the warp

  const OUTRO_BURST_DURATION = 900; // big-streak phase
  const OUTRO_SETTLE_DURATION = 700; // glide into calm stars

  // Phase 1: high warp streaks
  setTimeout(() => {
    // Phase 2: glide back down to the idle "hovering stars" state
    warpTarget = WARP_IDLE; // ~0.25
    starTargetAlpha = 1.0; // keep stars visible

    setTimeout(() => {
      // Outro warp finished
      isWarping = false;
      isInStory = false;
      isStoryActive = false;

      warpTarget = WARP_IDLE;
      starTargetAlpha = 1.0;
      isOutroWarp = false; // <-- turn off special tint

      document.body.classList.remove("cinematic-mode");

      // Hand off to conclusion screen logic
      if (onComplete) onComplete();

      // Gentle re-affirm of visible stars after layout settles
      setTimeout(() => {
        starTargetAlpha = 1.0;
      }, 350);
    }, OUTRO_SETTLE_DURATION);
  }, OUTRO_BURST_DURATION);
}

function cleanupStarsForTimeline() {
  // We are going back into the STORY (timeline) state
  isInStory = true;
  isStoryActive = true;
  isWarping = false;

  // No warp motion, no visible stars
  warpTarget = 0;
  warpFactor = 0;
  starTargetAlpha = 0;
  starGlobalAlpha = 0;

  isEarthVisible = true;
  draw(); // one clean frame of dark, starless background
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

    const firstStepBlock = document.querySelector(".step-block");
    if (firstStepBlock) {
      const rect = firstStepBlock.getBoundingClientRect();
      const offset = window.innerHeight * 0.2;
      const targetTop = window.pageYOffset + rect.top - offset;

      window.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });

      // *** NEW: force-activate the first step so it always highlights ***
      const firstStep = firstStepBlock.querySelector(".step");
      if (firstStep) {
        // Small timeout so we’re roughly at the right scroll position
        setTimeout(() => {
          // Only run if we’re actually in the story and not warping
          if (isInStory && !isWarping && !isZooming) {
            handleStepEnter(firstStep);
          }
        }, 300);
      }
    }
  });
}


const yearToggleEl = document.getElementById("year-toggle");
const yearToggleButtons = yearToggleEl
  ? yearToggleEl.querySelectorAll(".year-toggle-option")
  : [];
if (yearToggleEl) {
  yearToggleEl.classList.remove("visible"); // make sure it starts hidden
}

function setYearMode(mode) {
  if (!yearToggleEl) return;
  if (mode !== "event" && mode !== "after") return;
  if (mode === currentYearMode) return;

  currentYearMode = mode;

  yearToggleButtons.forEach((btn) => {
    const btnMode = btn.dataset.mode;
    btn.classList.toggle("active", btnMode === currentYearMode);
  });

  // Trigger glow pulse animation on the toggle container
  yearToggleEl.classList.remove("glow-pulse");
  // force reflow so animation can restart
  void yearToggleEl.offsetWidth;
  yearToggleEl.classList.add("glow-pulse");

  // Re-load globe for the current active step if any, with dot transition
  if (currentStepElement) {
    const file = getGlobeFileForStep(currentStepElement);
    if (file) {
      animateDotTransition(() => updateYear(file));
    }
  }
}


if (yearToggleButtons.length) {
  yearToggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      setYearMode(mode);
    });
  });
}
// === Conclusion Button (MUST wait until countries.json is loaded) ===
const conclusionBtn = document.getElementById("conclusion-btn");
const conclusionSection = document.getElementById("conclusion");

function setupConclusionButton() {
  if (!conclusionBtn || !conclusionSection) return;

  function showConclusionScreen() {
    // 1) Hide the Event / +10 Years toggle in conclusion
    if (yearToggleEl) {
      yearToggleEl.classList.remove("visible");
      currentYearMode = "event";
      yearToggleButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === "event");
      });
    }

    // 2) Reveal the conclusion section
    conclusionSection.classList.remove("hidden-outro");

    // Fade the card in instead of popping it
    const outroCard = conclusionSection.querySelector(".outro-card");
    if (outroCard) {
      // ensure we start from the "hidden" state
      outroCard.classList.remove("is-visible");
      // wait one frame so display:none → block has applied
      requestAnimationFrame(() => {
        outroCard.classList.add("is-visible");
      });
    }

    // IMPORTANT: now that countries is guaranteed loaded,
    // the globe can safely initialize
    if (!conclusionInitialized) {
      requestAnimationFrame(() => {
        initConclusionGlobe();
      });
    } else {
      requestAnimationFrame(() => {
        resizeConclusionGlobe();
        drawConclusionGlobe();
      });
    }

    // 3) Hide timeline and scroll to conclusion
    const scrollyEl = document.getElementById("scrolly");
    if (scrollyEl) scrollyEl.style.display = "none";
    document.body.classList.remove("cinematic-mode");

    conclusionSection.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  // Use the reverse-warp outro before showing the conclusion
  conclusionBtn.addEventListener("click", () => {
    playOutroWarpToConclusion(showConclusionScreen);
  });
}


if (!DEV_MODE) {
  lockScroll();
  window.scrollTo(0, 0);
}

// === Conclusion Globe (interactive) ===
const conclusionCanvas = document.getElementById("globe-conclusion");
let conclusionCtx = conclusionCanvas ? conclusionCanvas.getContext("2d") : null;
let conclusionProjection, conclusionPath;
let conclusionPlotData = [];

let conclusionColorScale = d3
  .scaleLinear()
  .range(["#020b1f", "#38bdf8", "#f97316"])
  .clamp(true);

// All years from 1850–2014 (inclusive)
const conclusionYears = d3.range(1850, 2015);

let conclusionInitialized = false;
let conclusionDragging = false;
let dragStart = null;
let rotationStart = null;

function resizeConclusionGlobe() {
  if (!conclusionCanvas || !conclusionCtx || !countries) return;
  const rect = conclusionCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return; // invisible (hidden-outro)

  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(rect.width, rect.width); // square

  conclusionCanvas.width = size * dpr;
  conclusionCanvas.height = size * dpr;
  conclusionCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  conclusionProjection = d3
    .geoOrthographic()
    .clipAngle(90)
    .rotate([-20, -10])
    .scale(size / 2.2)
    .translate([size / 2, size / 2]);

  conclusionPath = d3.geoPath().projection(conclusionProjection).context(conclusionCtx);

  drawConclusionGlobe();
}

function applyConclusionData(rows) {
  // 1) Map rows into the same structure used by updateYear()
  let yearData = rows.map(d => {
    return {
      lat: +d.lat,
      lon: +d.lon,
      co2: +d.fco2antt,
      weight: 1  // in conclusion there is no regional mask, matches timeline outside steps
    };
  });

  // 2) Filter like timeline: drop extremely low-weight / invalid
  let scaleSample = yearData.filter(d => d.co2 > 0 && d.weight > 0.2);
  if (!scaleSample.length) {
    scaleSample = yearData.filter(d => d.co2 > 0);
  }

  // 3) Same quantile domain used in timeline
  const landValues = scaleSample.map(d => d.co2).sort(d3.ascending);
  if (landValues.length) {
    const q80 = d3.quantile(landValues, 0.8);
    const q95 = d3.quantile(landValues, 0.95);
    conclusionColorScale.domain([0, q80, q95]);
  }

  // 4) IDENTICAL binning to timeline globe
  const BIN_SIZE = 1.5;
  const binned = d3.rollup(
    yearData,
    v => ({
      co2: d3.mean(v, d => d.co2),
      weight: d3.mean(v, d => d.weight)
    }),
    d => Math.round(d.lat / BIN_SIZE) * BIN_SIZE,
    d => Math.round(d.lon / BIN_SIZE) * BIN_SIZE
  );

  // 5) Build plotData exactly like timeline does (including jitter)
  conclusionPlotData = [];
  binned.forEach((lons, lat) => {
    lons.forEach((val, lon) => {
      conclusionPlotData.push({
        lat: +lat,
        lon: +lon,
        co2: val.co2,
        weight: val.weight,
        jitterX: (Math.random() - 0.5) * 1.2,
        jitterY: (Math.random() - 0.5) * 1.2
      });
    });
  });

  drawConclusionGlobe();
}


// Cache to avoid re-fetching 165 separate files
let conclusionFileCache = {};

function loadConclusionYear(year) {
  const file = `data/${year}_co.csv`;

  // Update label immediately
  const labelEl = document.getElementById("conclusion-year-label");
  if (labelEl) labelEl.textContent = year;

  // 1. If Cached: Yield briefly, then draw
  if (conclusionFileCache[file]) {
    // setTimeout(..., 0) pushes the heavy math to the END of the event loop,
    // guaranteeing the slider has physically moved on screen first.
    setTimeout(() => {
      applyConclusionData(conclusionFileCache[file]);
    }, 0);
    return;
  }

  // 2. If Loading: Fetch, then draw
  d3.csv(file)
    .then((rows) => {
      // Normalize immediately
      rows.forEach((d) => {
        d.lat = +d.lat;
        d.lon = +d.lon;
        d.fco2antt = +d.fco2antt || +d.fco2 || +d.value || 0;
      });
      conclusionFileCache[file] = rows;

      // Yield before applying
      setTimeout(() => {
        applyConclusionData(rows);
      }, 0);
    })
    .catch((err) => {
      console.error("[conclusion] Failed to load", file, err);
      // Even the empty draw should be yielded to keep rhythm
      setTimeout(() => {
        applyConclusionData([]);
      }, 0);
    });
}

function drawConclusionGlobe() {
  if (!conclusionCtx || !conclusionProjection || !countries) return;

  const canvas = conclusionCanvas;
  conclusionCtx.clearRect(0, 0, canvas.width, canvas.height);

const t = conclusionProjection.translate();
const cx = t[0];
const cy = t[1];
let r = conclusionProjection.scale() - 3;

// avoid negative radius if something funky happens with sizing
if (r <= 0) return;

// ocean
conclusionCtx.beginPath();
conclusionCtx.arc(cx, cy, r, 0, Math.PI * 2);

  conclusionCtx.fillStyle = OCEAN_COLOR;
  conclusionCtx.fill();

  // atmosphere glow
  const glowGrad = conclusionCtx.createRadialGradient(
    cx,
    cy,
    r * 0.95,
    cx,
    cy,
    r * 1.1
  );
  glowGrad.addColorStop(0, ATMOS_INNER);
  glowGrad.addColorStop(1, ATMOS_OUTER);

  conclusionCtx.beginPath();
  conclusionCtx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
  conclusionCtx.fillStyle = glowGrad;
  conclusionCtx.fill();

  // dots
  const domain = conclusionColorScale.domain();
  const maxVal = domain[domain.length - 1] || 1;

  conclusionPlotData.forEach((d) => {
    const coords = conclusionProjection([d.lon, d.lat]);
    if (!coords) return;
    const x = coords[0];
    const y = coords[1];
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy > r * r) return;

    const intensity = Math.min(1, d.co2 / maxVal);
    const radius = 1.3 + intensity * 1.7;
    const alpha = 0.25 + intensity * 0.75;

    conclusionCtx.beginPath();
    conclusionCtx.arc(x, y, radius, 0, Math.PI * 2);
    conclusionCtx.fillStyle = conclusionColorScale(d.co2);
    conclusionCtx.globalAlpha = alpha;
    conclusionCtx.fill();
  });

  conclusionCtx.globalAlpha = 1;

  // graticule + land
  conclusionCtx.beginPath();
  conclusionCtx.strokeStyle = "rgba(148, 163, 184, 0.25)";
  conclusionCtx.lineWidth = 0.4;
  conclusionPath(graticule);
  conclusionCtx.stroke();

  conclusionCtx.fillStyle = "rgba(0,0,0,0)";
  conclusionCtx.strokeStyle = "rgba(148, 163, 184, 0.85)";
  conclusionCtx.lineWidth = 0.6;
  conclusionCtx.beginPath();
  conclusionPath(countries);
  conclusionCtx.fill();
  conclusionCtx.stroke();
}

function initConclusionGlobe() {
  if (!conclusionCanvas || !countries) return;

  resizeConclusionGlobe();

  const slider = document.getElementById("conclusion-year-slider");
  const defaultYear = 2014;

  if (slider) {
    slider.min = 0;
    slider.max = conclusionYears.length - 1;
    slider.value = String(conclusionYears.indexOf(defaultYear));

    // --- NEW SMOOTH SLIDER LOGIC ---
    let isGlobeUpdateScheduled = false;

    let throttleTimer = null;
    let lastRenderTime = 0;

    slider.addEventListener("input", () => {
      const idx = +slider.value;
      const year = conclusionYears[idx];

      // 1. Update Text Immediately (Cheap)
      const labelEl = document.getElementById("conclusion-year-label");
      if (labelEl) labelEl.textContent = year;

      // 2. Throttle the Heavy Math (Expensive)
      const now = Date.now();

      // If we haven't drawn in 80ms, draw immediately (updates WHILE dragging)
      if (now - lastRenderTime > 80) {
        loadConclusionYear(year);
        lastRenderTime = now;
      }

      // ALWAYS schedule a "trailing" update.
      // This guarantees that when you STOP dragging, the final year is drawn.
      clearTimeout(throttleTimer);
      throttleTimer = setTimeout(() => {
        loadConclusionYear(year);
        lastRenderTime = Date.now();
      }, 80);
    });
    // --------------------------------

    // Pause starfield while interacting
    const pauseStars = () => {
      starsPaused = true;
    };
    const resumeStars = () => {
      starsPaused = false;
    };

    slider.addEventListener("pointerdown", pauseStars);
    slider.addEventListener("pointerup", resumeStars);
    slider.addEventListener("pointercancel", resumeStars);
    slider.addEventListener("pointerleave", resumeStars);

    // Initial load
    loadConclusionYear(defaultYear);
  }
  conclusionCanvas.addEventListener("mousedown", (e) => {
    conclusionDragging = true;
    dragStart = [e.clientX, e.clientY];
    rotationStart = conclusionProjection.rotate();
  });

  window.addEventListener("mousemove", (e) => {
    if (!conclusionDragging || !rotationStart) return;
    const dx = e.clientX - dragStart[0];
    const dy = e.clientY - dragStart[1];

    const sensitivity = 0.3;
    const newRotate = [
      rotationStart[0] + dx * sensitivity,
      rotationStart[1] - dy * sensitivity,
      rotationStart[2],
    ];
    conclusionProjection.rotate(newRotate);
    drawConclusionGlobe();
  });

  window.addEventListener("mouseup", () => {
    conclusionDragging = false;
  });

  conclusionInitialized = true;
}

if (canvas) {
  // Mouse
  canvas.addEventListener("mousedown", (e) => {
    beginMainGlobeDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mousemove", (e) => {
    if (!mainGlobeDragging) return;
    moveMainGlobeDrag(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    endMainGlobeDrag();
  });

  // Touch
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || !e.touches.length) return;
      const t = e.touches[0];
      beginMainGlobeDrag(t.clientX, t.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!mainGlobeDragging) return;
      if (!e.touches || !e.touches.length) return;
      const t = e.touches[0];
      // prevent the page from scrolling while rotating the globe
      e.preventDefault();
      moveMainGlobeDrag(t.clientX, t.clientY);
    },
    { passive: false }
  );

  window.addEventListener("touchend", () => {
    endMainGlobeDrag();
  });

  window.addEventListener("touchcancel", () => {
    endMainGlobeDrag();
  });
}

// Allow dragging the globe even when the intro overlay (#intro-cards) is on top
if (introCards && canvas) {
  // Mouse: start drag when clicking in the empty space over the globe
  introCards.addEventListener("mousedown", (e) => {
    // Don't hijack clicks on the cards or buttons
    if (e.target.closest(".intro-card") || e.target.closest("button")) return;

    beginMainGlobeDrag(e.clientX, e.clientY);
  });

  // Touch: same idea for mobile
  introCards.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest(".intro-card") || e.target.closest("button")) return;
      if (!e.touches || !e.touches.length) return;
      const t = e.touches[0];
      beginMainGlobeDrag(t.clientX, t.clientY);
    },
    { passive: true }
  );
}


const backToIntroBtn = document.getElementById("back-to-intro-btn");
if (backToIntroBtn) {
  backToIntroBtn.addEventListener("click", () => {
    // Collapse race panel + hide proceed
    document.body.classList.remove("race-expanded", "race-lift");

    const proceedBtnEl = document.getElementById("proceed-btn");
    if (proceedBtnEl) {
      proceedBtnEl.classList.remove("visible");
    }

    // Leave story (globe + UI)
    leaveStory();

    // Hard reset starfield + story state to intro
    resetStarfieldForIntro();

    // Put user back at top, and lock scroll like initial load
    lockScroll();
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    if (typeof resizeGlobe === "function") {
      resizeGlobe(); // or updateProjectionScale(); whichever your code uses
      draw(); // force a repaint so spacing fixes instantly
    }
  });
}


const backToRaceBtn = document.getElementById("back-to-race-btn");
if (backToRaceBtn) {
  backToRaceBtn.addEventListener("click", () => {
    // Only do this if we’re already in the story and not mid-warp/zoom
    if (!isInStory || isWarping || isZooming) return;

    // 1) Lock scroll while the race overlay is up
    lockScroll();

    // 2) Clear any “step” / zoom state from the timeline
    currentStepElement = null;
    focusLon = null;
    focusLat = null;
    activeRegionLabel = "";
    currentStepZoomMultiplier = 1;

    // 3) Reset year toggle back to event mode and hide it
    if (yearToggleEl) {
      currentYearMode = "event";
      yearToggleEl.classList.remove("visible");
      yearToggleButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === "event");
      });
    }

    // 4) Show intro cards / race again
    showIntroCards();

    // 5) Wait a frame for layout, then reset the globe + scroll
    requestAnimationFrame(() => {
      // Recompute canvas + panel size
      resizeCanvas();

      // Reset rotation to default intro view
      if (projection) {
        projection.rotate([0, 0, 0]);
        // Intro scene scale
        projection.scale(targetScale * 0.9);
      }

      // Load original intro data (1850)
      updateYear("data/1850_co.csv");

      // Redraw globe
      draw();

      // Scroll so the race/intro area is in view
      const scrollyTop = scrolly ? scrolly.offsetTop : 0;
      window.scrollTo({
        top: scrollyTop,
        behavior: "smooth",
      });
    });
  });
}


const backToTimelineBtn = document.getElementById("back-to-timeline-btn");
if (backToTimelineBtn && conclusionSection) {
  backToTimelineBtn.addEventListener("click", () => {
    // Put starfield & state back into story / timeline mode
    cleanupStarsForTimeline();

    // 1) Hide the conclusion section again
    conclusionSection.classList.add("hidden-outro");

    // 2) Show the scrolly timeline section
    const scrollyEl = document.getElementById("scrolly");
    if (scrollyEl) {
      scrollyEl.style.display = ""; // revert to CSS (flex)
    }

    // 3) Scroll to the current active newspaper page (or first one)
    let targetBlock = document.querySelector(
      ".step-block.newspaper-page.is-active"
    );
    if (!targetBlock) {
      targetBlock = document.querySelector(".step-block.newspaper-page");
    }

    if (targetBlock) {
      const rect = targetBlock.getBoundingClientRect();
      const offset = window.innerHeight * 0.2;
      const targetTop = window.pageYOffset + rect.top - offset;

      window.scrollTo({
        top: targetTop,
        behavior: "auto",
      });

      // Re-activate the step so the globe + toggle state are correct
      const stepEl = targetBlock.querySelector(".step");
      if (stepEl && !isWarping && !isZooming) {
        handleStepEnter(stepEl);
      }
    }
  });
}
