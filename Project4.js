let map;
let geocoder;

const totalRounds = 5;
let roundIndex = 0;
let correctCount = 0;

let currentTarget = null;      // name, address, bounds 
let answerLocked = false;      // prevents extra clicks during a round

let clickMarker = null;
let activeRect = null;

// Timer
let startTimeMs = 0;
let timerInterval = null;

// UI nodes
const roundText = document.getElementById("roundText");
const targetText = document.getElementById("targetText");
const timerText = document.getElementById("timerText");
const highScoreText = document.getElementById("highScoreText");
const messageEl = document.getElementById("message");
const historyEl = document.getElementById("history");
const finalEl = document.getElementById("final");

document.getElementById("resetBtn").addEventListener("click", resetGame);
document.getElementById("clearHighBtn").addEventListener("click", () => {
  localStorage.removeItem("csunMapQuizHighScore");
  renderHighScore();
  setMessage("High score reset!");
});

const locations = [
  { name: "Oasis Wellness Center — F4", address: "Oasis Wellness Center, CSUN, Northridge, CA" },
  { name: "Chaparral Hall — F3", address: "Chaparral Hall, CSUN, Northridge, CA" },
  { name: "Sierra Tower — C3", address: "Sierra Tower, CSUN, Northridge, CA" },
  { name: "Black House — B6", address: "Black House, CSUN, Northridge, CA" },
  { name: "The Soraya — E1", address: "The Soraya, CSUN, Northridge, CA" }
];

// Called by Google Maps script callback
window.initMap = function initMap() {
  geocoder = new google.maps.Geocoder(); // geocoder instance to translate building names into coordinates

  // approximate CSUN center
  const csunCenter = { lat: 34.2400, lng: -118.5290 };

  // Campus bounds for map display area
  const campusBounds = {
    north: 34.2910,
    south: 34.2315,
    east: -118.5135,
    west: -118.5425
  };

  // creates map and interaction settings
  map = new google.maps.Map(document.getElementById("map"), {
    center: csunCenter,
    zoom: 5,
    mapTypeId: "roadmap",

    // User controls
    disableDefaultUI: true,
    draggable: false,
    scrollwheel: false,
    disableDoubleClickZoom: true,
    gestureHandling: "none",
    keyboardShortcuts: false,

    // Restrict the view area to keep user in same area
    restriction: {
      latLngBounds: campusBounds,
      strictBounds: true
    }
  });

  // Add event listener for double click
  map.addListener("dblclick", (e) => {
    if (!currentTarget) return;
    if (answerLocked) return;
    handleGuess(e.latLng);
  });

  renderHighScore();  //high score functionality TODO
  startGame();
};

function startGame() {
  roundIndex = 0;
  correctCount = 0;
  historyEl.textContent = "";
  finalEl.classList.add("hidden");
  finalEl.textContent = "";
  clearMapFeedback();

  startTimer();
  loadRound();
}

function resetGame() {
  stopTimer();
  startGame();
  setMessage("Game reset!");
}

// Loads next round of quiz and updates geocode and text for next target building guess
function loadRound() {
  answerLocked = false; // reset after every guess to allow for new guess
  clearMapFeedback();

  // Update on screen information
  if (roundIndex >= totalRounds) {
    endGame();
    return;
  }

  const loc = locations[roundIndex];
  roundText.textContent = `${roundIndex + 1} / ${totalRounds}`;
  targetText.textContent = loc.name;

  setMessage(`Make your guess!`);

  // Convert the building name/address to a LatLng using the JS API Geocoder error check
  geocoder.geocode({ address: loc.address }, (results, status) => {
    if (status !== "OK" || !results || !results[0]) {
      setMessage("Geocoder failed. Check API key + that Geocoding is enabled.");
      console.log("Geocode status:", status, results);
      return;
    }

    const point = results[0].geometry.location;

    // Create a small "correct zone" rectangle around the point.
    const d = 0.00028; // about ~30m-ish scale
    const bounds = new google.maps.LatLngBounds(
      { lat: point.lat() - d, lng: point.lng() - d },
      { lat: point.lat() + d, lng: point.lng() + d }
    );

    currentTarget = {
      name: loc.name,
      address: loc.address,
      bounds: bounds
    };
  });
}

// Handle and check user's guess compared to defined "correct area"
function handleGuess(latLng) {
  answerLocked = true; // 1 guess per round

  // marker where user clicked
  if (clickMarker) clickMarker.setMap(null);
  clickMarker = new google.maps.Marker({
    position: latLng,
    map: map,
    title: "Your Guess"
  });

  const isCorrect = currentTarget.bounds.contains(latLng); // Guess within "correct area" rectangle?

  // Show green or red rectangle based on correct vs incorrect
  drawAnswerRectangle(currentTarget.bounds, isCorrect);

  if (isCorrect) {
    correctCount++;
    setMessage("Correct!");
    addHistoryItem(currentTarget.name, true);
  } else {
    setMessage("Incorrect!");
    addHistoryItem(currentTarget.name, false);
  }

  // Delay between user selections and result showings
  setTimeout(() => {
    roundIndex++;
    loadRound();
  }, 1200);
}

// Actually draws and displays rectangle and color based off correct vs incorrect
function drawAnswerRectangle(bounds, correct) {
  if (activeRect) activeRect.setMap(null);

  activeRect = new google.maps.Rectangle({
    bounds: bounds,
    strokeOpacity: 0.9,
    strokeWeight: 2,
    fillOpacity: 0.20,
    strokeColor: correct ? "#1b7f3a" : "#b32020",
    fillColor: correct ? "#1b7f3a" : "#b32020",
    map: map
  });
}

// Result history using dynamic DOM element
function addHistoryItem(name, correct) {
  // Using createElement + appendChild
  const li = document.createElement("li");
  const text = document.createTextNode(`${correct ? "✅" : "❌"} ${name}`);
  li.appendChild(text);
  historyEl.appendChild(li);
}

function endGame() {
  stopTimer();

  const timeSec = (Date.now() - startTimeMs) / 1000;
  const scoreText = `Final Score: ${correctCount} / ${totalRounds} in ${timeSec.toFixed(1)}s`;

  finalEl.textContent = scoreText;
  finalEl.classList.remove("hidden");

  setMessage(`Game over. ${scoreText}`);

  // Save high score
  const prev = getHighScore();
  const current = { correct: correctCount, seconds: timeSec }; // tiebreaker looks at time

  let beat = false;
  if (!prev) beat = true;
  else if (current.correct > prev.correct) beat = true;
  else if (current.correct === prev.correct && current.seconds < prev.seconds) beat = true;

  // Set a new highscore if the new score is higher than current highscore
  if (beat) {
    localStorage.setItem("csunMapQuizHighScore", JSON.stringify(current));
    setMessage(`New high score: ${correctCount}/${totalRounds} in ${timeSec.toFixed(1)}s. Respect.`);
  }

  renderHighScore();
}

// Clears map of markers made with previous guesses and corrections
function clearMapFeedback() {
  if (clickMarker) { clickMarker.setMap(null); clickMarker = null; }
  if (activeRect) { activeRect.setMap(null); activeRect = null; }
}

// Function for displaying messages to user
function setMessage(text) {
  messageEl.textContent = text;
}

// Extra functionality that starts timer that updates ever 100 ms to track how long it takes user to guess
function startTimer() {
  startTimeMs = Date.now();
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const sec = (Date.now() - startTimeMs) / 1000;
    timerText.textContent = `${sec.toFixed(1)}s`;
  }, 100);
}

// Stops timer after final guess or refresh
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Grabs highscore from DOM
function getHighScore() {
  const raw = localStorage.getItem("csunMapQuizHighScore");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Displays high score
function renderHighScore() {
  const hs = getHighScore();
  if (!hs) {
    highScoreText.textContent = "—";
    return;
  }
  highScoreText.textContent = `${hs.correct}/5 in ${hs.seconds.toFixed(1)}s`;
}
