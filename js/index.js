/*
 * Taskmaster Scoreboard - Using Google Sheets API
 */

(function() {
	const GOOGLE_SHEETS_API_KEY = CONFIG.GOOGLE_SHEETS_API_KEY;
	const SPREADSHEET_ID = CONFIG.SPREADSHEET_ID;
	const SHEET_NAME = CONFIG.SHEET_NAME;

	var contestants = [];
	var locked = true; // Start with locked = true to disable add button
	var taskColumns = []; // Store task column names
	var completedTasks = []; // Track which tasks are complete
	var lastFetchTime = null;
	var isAnimating = false; // Track if animation is in progress

	var main = document.querySelector("main");
	var fileInput = document.querySelector("#file-input");
	var playButton = document.querySelector("#play-button");

	// Load saved state from localStorage if available
	function loadSavedState() {
		try {
			var savedState = localStorage.getItem('tmScoreboardState');
			if (savedState) {
				var state = JSON.parse(savedState);
				contestants = state.contestants || [];
				taskColumns = state.taskColumns || [];
				completedTasks = state.completedTasks || [];
				lastFetchTime = state.lastFetchTime || null;

				 // Reset el property which can't be properly serialized
				for (var i = 0; i < contestants.length; i++) {
					contestants[i].el = null;
				}

				// If we have contestants, refresh the UI
				if (contestants.length > 0) {
					refreshContestants();
					resize();
				}

				return true;
			}
		} catch (e) {
			console.error("Error loading saved state:", e);
		}
		return false;
	}

	// Save current state to localStorage
	function saveState() {
		try {
			var state = {
				contestants: contestants,
				taskColumns: taskColumns,
				completedTasks: completedTasks,
				lastFetchTime: lastFetchTime
			};
			localStorage.setItem('tmScoreboardState', JSON.stringify(state));
		} catch (e) {
			console.error("Error saving state:", e);
		}
	}

	function addContestant(image, name) {
		var contestant = {};

		contestant.image = !!image ? image : "./images/blank.jpg";
		contestant.score = 0;
		contestant.oldScore = 0;
		contestant.name = name || "Contestant " + (contestants.length + 1);
		contestant.taskScores = {};

		contestants.push(contestant);
		saveState();

		return contestants.length;
	}

	function removeContestant(idx) {
		contestants.splice(idx, 1);
		saveState();
	}

	// Get portrait image for contestant
	function getPortraitImage(name) {
		if (!name) return "./images/blank.jpg";

		// Convert name to lowercase and replace spaces with nothing
		// This allows matching "John Doe" with "johndoe.png"
		const simpleName = name.toLowerCase().replace(/[^a-z0-9]/g, '');

		// Return the path to the portrait image
		return `./images/portraits/${simpleName}.png`;
	}

	// Fetch data from Google Sheets
	async function fetchSheetData() {
		try {
			playButton.classList.add('loading');

			// Construct the Google Sheets API URL
			const range = encodeURIComponent(SHEET_NAME);
			const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${GOOGLE_SHEETS_API_KEY}`;

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			const values = data.values || [];

			if (values.length === 0) {
				throw new Error("No data found in the spreadsheet");
			}

			// Process the spreadsheet data
			return processSheetData(values);
		} catch (error) {
			console.error("Error fetching spreadsheet data:", error);
			alert(`Error fetching spreadsheet data: ${error.message}`);
			return false;
		} finally {
			playButton.classList.remove('loading');
		}
	}

	// Process data from Google Sheets into our format
	function processSheetData(values) {
		// First row contains headers
		const headers = values[0];

		// Check if we have task columns (everything after the first column)
		taskColumns = headers.slice(1).filter(function(header) {
			return header.trim() !== '';
		});

		// Process contestant data
		const sheetData = [];
		for (let i = 1; i < values.length; i++) {
			const row = values[i];
			if (!row[0]) continue; // Skip rows without a name

			const entry = {
				name: row[0],
				taskScores: {}
			};

			// Process task scores
			for (let j = 0; j < taskColumns.length; j++) {
				const taskName = taskColumns[j];
				const taskValue = row[j + 1] ? row[j + 1].trim() : '';
				if (taskValue !== '') {
					entry.taskScores[taskName] = parseFloat(taskValue) || 0;
				}
			}

			sheetData.push(entry);
		}

		// Determine which tasks are complete (all contestants have scores)
		completedTasks = [];
		for (let i = 0; i < taskColumns.length; i++) {
			const taskName = taskColumns[i];
			let isComplete = true;

			for (let j = 0; j < sheetData.length; j++) {
				if (!(taskName in sheetData[j].taskScores)) {
					isComplete = false;
					break;
				}
			}

			if (isComplete) {
				completedTasks.push(taskName);
			}
		}

		// Calculate total scores for completed tasks
		for (let i = 0; i < sheetData.length; i++) {
			let totalScore = 0;
			for (let j = 0; j < completedTasks.length; j++) {
				const taskName = completedTasks[j];
				if (taskName in sheetData[i].taskScores) {
					totalScore += sheetData[i].taskScores[taskName];
				}
			}
			sheetData[i].score = totalScore;
		}

		// Update last fetch time
		lastFetchTime = new Date().getTime();

		return sheetData;
	}

	// Check for score changes and update contestants
	function updateScores(sheetData) {
		if (!sheetData || sheetData.length === 0) return false;

		var hasChanges = false;
		var previousCompletedTasks = completedTasks.length;

		// If we have fewer contestants than sheet entries, add new ones
		while (contestants.length < sheetData.length) {
			const newContestant = sheetData[contestants.length];
			// Use the portrait image based on name
			addContestant(getPortraitImage(newContestant.name), newContestant.name);
			hasChanges = true;
		}

		// Update scores from sheet data
		for (let i = 0; i < contestants.length && i < sheetData.length; i++) {
			const sheetEntry = sheetData[i];
			const contestant = contestants[i];

			// Update task scores
			contestant.taskScores = sheetEntry.taskScores || {};

			// Calculate new score based on completed tasks
			let newScore = 0;
			for (let j = 0; j < completedTasks.length; j++) {
				const taskName = completedTasks[j];
				if (taskName in contestant.taskScores) {
					newScore += contestant.taskScores[taskName];
				}
			}

			// Check if the score has changed
			if (contestant.score !== newScore) {
				contestant.score = newScore;
				hasChanges = true;
			}

			// Update contestant name and possibly portrait if needed
			if (sheetEntry.name && contestant.name !== sheetEntry.name) {
				contestant.name = sheetEntry.name;
				contestant.image = getPortraitImage(sheetEntry.name);
				hasChanges = true;
			}
		}

		// Check if a new task has been completed
		if (completedTasks.length > previousCompletedTasks) {
			hasChanges = true;
		}

		saveState();
		return hasChanges;
	}

	// Create contestant elements
	function createContestantEl(con, id) {
		var el = document.createElement("div");
		el.classList.add("contestant");
		el.dataset.id = id - 1; // Store contestant index for animation

		var frameScaler = document.createElement("div");
		frameScaler.classList.add("frame-scaler");

		var frameContainer = document.createElement("div");
		frameContainer.classList.add("frame-container");
		frameContainer.style.webkitAnimationDelay = -id * 1.25 + "s";
		frameContainer.style.animationDelay = -id * 1.25 + "s";

		var fill = document.createElement("div");
		fill.classList.add("fill");
		fill.style.backgroundImage = "url(" + con.image + ")";

		var shadow = document.createElement("div");
		shadow.classList.add("shadow");

		var frame = document.createElement("img");
		frame.src = "./images/frame.png";
		frame.classList.add("frame");
		frame.removeAttribute("width");
		frame.removeAttribute("height");

		// Add contestant name if available
		if (con.name) {
			var nameLabel = document.createElement("div");
			nameLabel.classList.add("contestant-name");
			nameLabel.textContent = con.name;
			frameContainer.appendChild(nameLabel);
		}

		// Add task info if we have completed tasks
		if (completedTasks.length > 0) {
			var taskInfo = document.createElement("div");
			taskInfo.classList.add("task-info");

			// Show the last completed task and its score
			var lastTask = completedTasks[completedTasks.length - 1];
			var taskScore = con.taskScores[lastTask] || 0;

			taskInfo.textContent = lastTask + ": " + taskScore;
			frameContainer.appendChild(taskInfo);
		}

		fill.appendChild(shadow);
		frameContainer.appendChild(fill);
		frameContainer.appendChild(frame);

		frameScaler.appendChild(frameContainer);

		var scoreContainer = document.createElement("div");
		scoreContainer.classList.add("score-container");

		var seal = document.createElement("img");
		seal.classList.add("seal");
		seal.src = "./images/seal.png";
		seal.removeAttribute("width");
		seal.removeAttribute("height");

		var score = document.createElement("h1");
		score.classList.add("score");
		score.innerText = con.oldScore;

		scoreContainer.appendChild(seal);
		scoreContainer.appendChild(score);

		el.appendChild(frameScaler);
		el.appendChild(scoreContainer);

		return el;
	}

	// Function to apply transforms to properly position contestants for animation
	function transformContestants() {
		// Apply transforms based on the current order
		for (var i = 0; i < contestants.length; i++) {
			var con = contestants[i];
			if (con.el) {
				// Ensure transition is active for animation
				con.el.style.transition = "transform 1s ease-in-out";

				// Set position based on index
				var xPosition = 275 * i + 30;
				con.el.style.transform = "translateX(" + xPosition + "px)";
			}
		}
	}

	// Sort contestants and update display
	function sortContestants() {
		// Sort the contestants array by score (descending)
		contestants.sort(function(a, b) {
			return a.score - b.score;
		});

		// Update positions with animation
		transformContestants();
	}

	// Refresh contestant display - with improved animation support
	function refreshContestants() {
		// If we already have elements, just update them rather than recreating
		if (contestants.length > 0 && contestants[0].el) {
			// Check if the element is in the DOM using a safe method
			var isInDOM = false;
			try {
				isInDOM = document.body.contains(contestants[0].el);
			} catch (e) {
				console.log("DOM check failed, will recreate elements:", e);
			}

			if (isInDOM) {
				// Update the existing elements - don't recreate them
				for (var i = 0; i < contestants.length; i++) {
					var con = contestants[i];

					// Update score display
					var scoreEl = con.el.querySelector(".score");
					if (scoreEl) {
						scoreEl.innerText = con.oldScore;
					}

					// Update task info if needed
					if (completedTasks.length > 0) {
						var taskInfo = con.el.querySelector(".task-info");
						if (!taskInfo) {
							taskInfo = document.createElement("div");
							taskInfo.classList.add("task-info");
							con.el.querySelector(".frame-container").appendChild(taskInfo);
						}

						var lastTask = completedTasks[completedTasks.length - 1];
						var taskScore = con.taskScores[lastTask] || 0;
						taskInfo.textContent = lastTask + ": " + taskScore;
					}
				}

				// Apply the transforms to enable animation
				transformContestants();
				return;
			}
		}

		// If we need to recreate everything (first time or after DOM changes)
		main.innerHTML = "";

		// First create all contestant elements
		for (var i = 0; i < contestants.length; i++) {
			var con = contestants[i];
			var cEl = createContestantEl(con, i + 1);
			con.el = cEl;

			// Add to the DOM immediately so we can animate later
			main.appendChild(cEl);
		}

		// Set initial positions without animation (force immediate positioning)
		for (var i = 0; i < contestants.length; i++) {
			var con = contestants[i];
			con.el.style.transition = "none";
			con.el.style.transform = "translateX(" + (275 * i + 30) + "px)";

			// Force a reflow to ensure the initial position is applied
			con.el.offsetHeight;
		}

		// Restore transition after a small delay
		setTimeout(function() {
			for (var i = 0; i < contestants.length; i++) {
				contestants[i].el.style.transition = "";
			}
		}, 50);
	}

	// Animation easing function
	function ease(t, a, b) {
		var eased = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
		return (b - a) * eased + a;
	}

	// Show play button
	function showPlay() {
		playButton.style.display = "block";
	}

	// Play animation and update scores
	async function play() {
		if (isAnimating) return;

		// Mark as animating
		isAnimating = true;

		// Don't hide the play button anymore
		playButton.classList.add('loading');

		// Check for new data from Google Sheets
		const sheetData = await fetchSheetData();
		const hasChanges = updateScores(sheetData);

		if (hasChanges) {
			// Lock the UI during animation
			if (!locked) {
				locked = true;
				document.body.classList.add("locked");
				resize();
			}

			// Refresh and position contestants
			refreshContestants();

			// Sort contestants to trigger reordering animation
			sortContestants();

			// Start the animation sequence after a brief delay
			setTimeout(function() {
				var start = 0;
				var loop = function(dt) {
					if (start == 0) {
						start = dt;
					}

					for (var i = 0, l = contestants.length; i < l; ++i) {
						var con = contestants[i];

						var startRemainder = con.oldScore - Math.floor(con.oldScore);
						var endRemainder = con.score - Math.floor(con.score);

						var scoreEl = con.el.querySelector(".score");

						var score = Math.round(ease(Math.min((dt - start) / 2000, 1), Math.floor(con.oldScore), Math.floor(con.score)));

						if (dt - start < 1000) {
							score += startRemainder;
						} else {
							score += endRemainder;
						}

						scoreEl.innerText = score;
					}

					if (dt - start < 2000) {
						window.requestAnimationFrame(loop);
					} else {
						for (var i = 0, l = contestants.length; i < l; ++i) {
							var con = contestants[i];
							con.oldScore = con.score;
						}
						saveState();

						// Animation complete
						isAnimating = false;
						playButton.classList.remove('loading');
					}
				};

				window.requestAnimationFrame(loop);
			}, 1000);
		} else {
			// If no changes, show a message
			alert("No new scores detected. Check your Google Sheet for updates.");
			isAnimating = false;
			playButton.classList.remove('loading');
		}
	}

	// Continue to iterate through the animation updates
	function continueIteration() {
		if (isAnimating) return false;

		// Trigger another animation cycle
		play();
		return true;
	}

	// Initial check for data on startup
	async function initialCheck() {
		// Show the play button immediately
		showPlay();

		const sheetData = await fetchSheetData();
		if (sheetData && sheetData.length > 0) {
			updateScores(sheetData);
			refreshContestants();
			resize();
		} else {
			// If no data available, initialize with default contestants
			for (var i = 0; i < 5; ++i) {
				addContestant(null, "Contestant " + (i+1));
			}
			refreshContestants();
			resize();
		}
	}

	// Play button handler
	playButton.addEventListener("click", play);

	// Setup resize handler
	function resize() {
		var w = window.innerWidth;
		var h = window.innerHeight;

		var wm = 1400 * ((contestants.length + (locked ? 0 : 0.25)) / 5);

		var m = Math.min(w / wm, h / 1080);

		main.style.msTransform = "scale(" + m + ")";
		main.style.transform = "scale(" + m + ")";

		main.style.left = (w - wm * m) / 2 + "px";
	}

	window.addEventListener("resize", resize);

	// Setup periodic checking for updates (every 30 seconds)
	function setupPeriodicCheck() {
		setInterval(async function() {
			if (isAnimating) return;

			const sheetData = await fetchSheetData();
			const hasChanges = updateScores(sheetData);

			if (hasChanges) {
				refreshContestants();
				resize();

				// Flash the play button to indicate new scores
				playButton.classList.add('has-updates');
				setTimeout(function() {
					playButton.classList.remove('has-updates');
				}, 2000);
			}
		}, 30000); // Check every 30 seconds
	}

	// Initialize
	loadSavedState() || initialCheck();
	setupPeriodicCheck();

	// Always show play button
	showPlay();
})();
