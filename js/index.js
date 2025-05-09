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
	var playButton = document.querySelector("#play-button");

	// Initialize data - We've removed the loadSavedState function since it's redundant
	function initializeApp() {
		// Show the play button immediately
		showPlay();

		// Fetch data from Google Sheets
		return initialCheck();
	}

	// Save minimal state to localStorage
	function saveState() {
		try {
			// Only save minimal data needed for animations
			var state = {
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

		// Check if we have at least 3 columns (Name, Total, and at least one Task)
		if (headers.length < 3) {
			console.error("Spreadsheet format incorrect. Expected at least 3 columns: Name, Total, and Tasks");
			return [];
		}

		// Task columns start from the third column (index 2) onwards
		// Skip the Name column (index 0) and Total column (index 1)
		taskColumns = headers.slice(2).filter(header => header.trim() !== '');

		// Process contestant data
		const sheetData = [];
		for (let i = 1; i < values.length; i++) {
			const row = values[i];
			if (!row[0]) continue; // Skip rows without a name

			const entry = {
				name: row[0],
				 // Total column is just stored for reference, not used directly for scoring
				totalFromSheet: row[1] ? parseFloat(row[1]) || 0 : 0,
				taskScores: {}
			};

			// Process task scores starting from column 3 (index 2)
			for (let j = 0; j < taskColumns.length; j++) {
				const taskName = taskColumns[j];
				const taskValue = row[j + 2] ? row[j + 2].trim() : ''; // Add +2 to account for Name and Total columns
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

		// Update last fetch time
		lastFetchTime = new Date().getTime();

		return sheetData;
	}

	// Update scores from sheet data
	function updateScores(sheetData) {
		if (!sheetData || sheetData.length === 0) return false;

		var hasChanges = false;
		var previousCompletedTasks = completedTasks.length;

		 // Create an array of sheet entries indexed by name for easy lookup
		const sheetEntriesByName = {};
		for (let i = 0; i < sheetData.length; i++) {
			sheetEntriesByName[sheetData[i].name] = sheetData[i];
		}

		// Update existing contestants or create new ones
		const updatedContestants = [];

		// First, update existing contestants with matching names
		for (let i = 0; i < sheetData.length; i++) {
			const sheetEntry = sheetData[i];

			// Find existing contestant with matching name
			const existingContestant = contestants.find(c => c.name === sheetEntry.name);

			if (existingContestant) {
				// Update task scores
				existingContestant.taskScores = sheetEntry.taskScores || {};

				// Calculate new score based on completed tasks
				let newScore = 0;
				for (let j = 0; j < completedTasks.length; j++) {
					const taskName = completedTasks[j];
					if (taskName in existingContestant.taskScores) {
						newScore += existingContestant.taskScores[taskName];
					}
				}

				// Check if score has changed
				if (existingContestant.score !== newScore) {
					existingContestant.score = newScore;
					// Keep oldScore as is for animation
					hasChanges = true;
				}

				updatedContestants.push(existingContestant);
			} else {
				// Create new contestant
				const newContestant = {
					name: sheetEntry.name,
					image: getPortraitImage(sheetEntry.name),
					taskScores: sheetEntry.taskScores || {},
					score: 0,
					oldScore: 0,
					el: null
				};

				// Calculate score
				for (let j = 0; j < completedTasks.length; j++) {
					const taskName = completedTasks[j];
					if (taskName in newContestant.taskScores) {
						newContestant.score += newContestant.taskScores[taskName];
						newContestant.oldScore = newContestant.score; // Initialize oldScore to match
					}
				}

				updatedContestants.push(newContestant);
				hasChanges = true;
			}
		}

		// Replace contestants array with updated array
		contestants = updatedContestants;

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
		// Determine if we should use two rows (when there are more than 5 contestants)
		const useDoubleRow = contestants.length > 5;
		const contestantsPerRow = useDoubleRow ? Math.ceil(contestants.length / 2) : contestants.length;

		// Define the vertical spacing constant - this controls the spacing between rows
		const VERTICAL_SPACING = 450; // Space between rows in pixels

		// Calculate the horizontal spacing to avoid overlap - adjust based on contestant count
		const HORIZONTAL_SPACING = useDoubleRow ? 225 : 275; // Use narrower spacing when in two rows

		// Apply transforms based on the current order and row layout
		for (var i = 0; i < contestants.length; i++) {
			var con = contestants[i];
			if (con.el) {
				// Ensure transition is active for animation
				con.el.style.transition = "transform 1s ease-in-out";

				// For two-row layout, first row has indices 0 to contestantsPerRow-1, second row has the rest
				let row = 0;
				let column = i;

				if (useDoubleRow) {
					if (i >= contestantsPerRow) {
						row = 1;
						column = i - contestantsPerRow;
					}

					// Calculate position based on row and column
					const xPosition = HORIZONTAL_SPACING * column + 30;

					// First row starts at y=0, second row at y=VERTICAL_SPACING
					const yPosition = row * VERTICAL_SPACING;

					con.el.style.transform = `translate(${xPosition}px, ${yPosition}px)`;
				} else {
					// Single row layout (original behavior)
					const xPosition = HORIZONTAL_SPACING * i + 30;
					con.el.style.transform = `translateX(${xPosition}px)`;
				}
			}
		}

		// Return the spacing values for other functions to use
		return {
			useDoubleRow,
			contestantsPerRow,
			verticalSpacing: VERTICAL_SPACING,
			horizontalSpacing: HORIZONTAL_SPACING
		};
	}

	// Refresh contestant display - with improved animation support
	function refreshContestants(animate = false) {
		// If we need to recreate everything (first time or after DOM changes)
		if (!animate || contestants.length === 0 || !contestants[0].el || !document.body.contains(contestants[0].el)) {
			main.innerHTML = "";

			// First create all contestant elements
			for (var i = 0; i < contestants.length; i++) {
				var con = contestants[i];
				var cEl = createContestantEl(con, i + 1);
				con.el = cEl;

				// Add to the DOM immediately
				main.appendChild(cEl);
			}

			// Determine if we should use two rows layout
			const useDoubleRow = contestants.length > 5;
			const contestantsPerRow = useDoubleRow ? Math.ceil(contestants.length / 2) : contestants.length;

			// Use the same spacing values as in transformContestants
			const VERTICAL_SPACING = 450; // Match the value in transformContestants
			const HORIZONTAL_SPACING = useDoubleRow ? 225 : 275; // Use narrower spacing when in two rows

			// Set initial positions without animation (force immediate positioning)
			for (var i = 0; i < contestants.length; i++) {
				var con = contestants[i];
				con.el.style.transition = "none";

				if (useDoubleRow) {
					// Calculate row and column for two-row layout
					let row = 0;
					let column = i;

					if (i >= contestantsPerRow) {
						row = 1;
						column = i - contestantsPerRow;
					}

					// Position based on row and column using the same approach as transformContestants
					const xPosition = HORIZONTAL_SPACING * column + 30;
					const yPosition = row * VERTICAL_SPACING;
					con.el.style.transform = `translate(${xPosition}px, ${yPosition}px)`;
				} else {
					// Single row layout
					const xPosition = HORIZONTAL_SPACING * i + 30;
					con.el.style.transform = `translateX(${xPosition}px)`;
				}

				// Force a reflow to ensure the initial position is applied
				con.el.offsetHeight;
			}

			// Restore transition after a small delay
			setTimeout(function() {
				for (var i = 0; i < contestants.length; i++) {
					contestants[i].el.style.transition = "";
				}
			}, 50);
		} else {
			// Just update the existing elements - don't recreate them
			// This preserves the animation between positions
			for (var i = 0; i < contestants.length; i++) {
				var con = contestants[i];

				// Only update score display (portraits and names remain unchanged)
				var scoreEl = con.el.querySelector(".score");
				if (scoreEl) {
					scoreEl.innerText = con.oldScore;
				}
			}

			// We still need to apply the transforms to position elements correctly
			transformContestants();
		}
	}

	// Setup resize handler
	function resize() {
		var w = window.innerWidth;
		var h = window.innerHeight;

		// Determine if we should use two rows (when there are more than 5 contestants)
		const useDoubleRow = contestants.length > 5;
		const contestantsPerRow = useDoubleRow ? Math.ceil(contestants.length / 2) : contestants.length;

		// Use the same spacing constants as in transformContestants
		const VERTICAL_SPACING = 450;
		const HORIZONTAL_SPACING = useDoubleRow ? 225 : 275;

		// Calculate width multiplier based on contestants per row and their spacing
		var wm = HORIZONTAL_SPACING * contestantsPerRow + 30;

		// Calculate height based on single row height (413px) or double row height
		var hm = useDoubleRow ? (413 + VERTICAL_SPACING) : 413;

		// Add margins by reducing the available space slightly
		const marginPercentage = 0.85; // Use 85% of available space, leaving 15% for margins
		w = w * marginPercentage;
		h = h * marginPercentage;

		// Calculate scaling factor to fit the screen
		var m = Math.min(w / wm, h / hm);

		// Set the scale transform
		main.style.msTransform = `scale(${m})`;
		main.style.transform = `scale(${m})`;

		// Position the main container centered both horizontally and vertically
		main.style.left = (window.innerWidth - wm * m) / 2 + "px";

		// Calculate vertical position to center the container
		const topPosition = (window.innerHeight - hm * m) / 2;
		main.style.top = topPosition + "px";

		// Set the correct height for the main container
		main.style.height = hm + "px";

		// For debugging
		console.log(`Screen size: ${window.innerWidth}x${window.innerHeight}`);
		console.log(`Container size: ${wm}x${hm}, Scale: ${m}, Position: ${main.style.left}, ${main.style.top}`);
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
			// First update the old score display for any animations
			for (let i = 0; i < contestants.length; i++) {
				const scoreEl = contestants[i].el?.querySelector(".score");
				if (scoreEl) {
					scoreEl.innerText = contestants[i].oldScore;
				}
			}

			// Sort contestants by score (this changes the array order)
			sortContestants();
			// Refresh contestants to apply the new order before starting the animation
			refreshContestants(true);

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

						var scoreEl = con.el?.querySelector(".score");
						if (!scoreEl) continue; // Skip if element not found

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

						// If auto-iterate is enabled, continue to the next animation
						if (CONFIG.AUTO_ITERATE) {
							setTimeout(continueIteration, 2000); // Wait 2 seconds before starting next iteration
						}
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

			// Ensure oldScore matches the new score for initial display
			// This prevents showing a stale oldScore before any animation.
			for (var i = 0; i < contestants.length; i++) {
				contestants[i].oldScore = contestants[i].score;
			}

			refreshContestants(); // Displays the current score (as oldScore now equals score)
			sortContestants();    // Sort based on the current scores
			resize();
		} else {
			// If no data available, initialize with default contestants
			for (var i = 0; i < 5; ++i) {
				addContestant(null, "Contestant " + (i+1));
			}
			refreshContestants();
			sortContestants();    // Sort default contestants as well
			resize();
		}
	}

	// Play button handler
	playButton.addEventListener("click", play);

	window.addEventListener("resize", resize);

	// Sort contestants and update display
	function sortContestants() {
		// Sort the contestants array by score (descending)
		contestants.sort(function(a, b) {
			return b.score - a.score; // Changed to sort in descending order (highest first)
		});

		// Update positions with animation
		transformContestants();

		// Make the highest scoring contestant's portrait larger
		highlightTopContestant();
	}

	// Highlight the top contestant by making their portrait larger
	function highlightTopContestant() {
		if (contestants.length === 0) return;

		// Reset all contestant frames to normal size
		for (let i = 0; i < contestants.length; i++) {
			if (contestants[i].el) {
				const frameScaler = contestants[i].el.querySelector(".frame-scaler");
				if (frameScaler) {
					frameScaler.classList.remove("larger");
				}
			}
		}

		// Make the top contestant (index 0 after sorting) larger
		if (contestants[0].el) {
			const frameScaler = contestants[0].el.querySelector(".frame-scaler");
			if (frameScaler) {
				frameScaler.classList.add("larger");
			}
		}
	}

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

	// Create and display the scores table
	function createScoresTable() {
		const tableEl = document.getElementById('scores-table');
		tableEl.innerHTML = '';

		// Sort contestants by score (descending)
		const sortedContestants = [...contestants].sort((a, b) => b.score - a.score);

		// Create header row
		const headerRow = document.createElement('tr');

		// Add Rank and Name headers
		const rankHeader = document.createElement('th');
		rankHeader.textContent = 'Rank';
		headerRow.appendChild(rankHeader);

		const nameHeader = document.createElement('th');
		nameHeader.textContent = 'Contestant';
		headerRow.appendChild(nameHeader);

		// Add task headers
		for (const task of taskColumns) {
			const taskHeader = document.createElement('th');
			taskHeader.textContent = task;
			headerRow.appendChild(taskHeader);
		}

		// Add total header
		const totalHeader = document.createElement('th');
		totalHeader.textContent = 'Total';
		headerRow.appendChild(totalHeader);

		tableEl.appendChild(headerRow);

		// Create contestant rows
		sortedContestants.forEach((contestant, index) => {
			const row = document.createElement('tr');

			// Add rank cell
			const rankCell = document.createElement('td');
			rankCell.textContent = (index + 1);
			row.appendChild(rankCell);

			// Add name cell
			const nameCell = document.createElement('td');
			nameCell.className = 'contestant-name';
			nameCell.textContent = contestant.name;
			row.appendChild(nameCell);

			// Add task score cells
			for (const task of taskColumns) {
				const scoreCell = document.createElement('td');
				const score = contestant.taskScores[task] || 0;
				scoreCell.textContent = score;

				// Highlight the highest score for each task
				if (score > 0 && score === Math.max(...sortedContestants.map(c => c.taskScores[task] || 0))) {
					scoreCell.className = 'highlight';
				}

				row.appendChild(scoreCell);
			}

			// Add total score cell
			const totalCell = document.createElement('td');
			totalCell.textContent = contestant.score;
			totalCell.className = 'highlight';
			row.appendChild(totalCell);

			tableEl.appendChild(row);
		});

		// Show the table overlay
		const tableOverlay = document.getElementById('scores-table-overlay');
		tableOverlay.style.display = 'flex';
	}

	// Setup event listeners for table toggle button
	function setupButtonListeners() {
		// Table toggle button
		const tableToggleBtn = document.getElementById('table-toggle-button');
		tableToggleBtn.addEventListener('click', createScoresTable);

		// Close table button
		const closeTableBtn = document.getElementById('close-table-button');
		closeTableBtn.addEventListener('click', function() {
			const tableOverlay = document.getElementById('scores-table-overlay');
			tableOverlay.style.display = 'none';
		});

		// Close table when clicking outside the content
		const tableOverlay = document.getElementById('scores-table-overlay');
		tableOverlay.addEventListener('click', function(event) {
			if (event.target === tableOverlay) {
				tableOverlay.style.display = 'none';
			}
		});
	}

	// Initialize
	initializeApp();
	setupPeriodicCheck();
	setupButtonListeners(); // Add this line to initialize button listeners

	// Always show play button
	showPlay();
})();
