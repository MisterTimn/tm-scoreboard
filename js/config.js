const AUTO_REFRESH_INTERVAL = 60 * 1000; // 60 seconds
const ANIMATION_DELAY = 1000; // 1 second
const SCORE_ANIMATION_DURATION = 1500; // 1.5 seconds
const DEFAULT_SORT_ORDER = 'desc'; // 'asc' for ascending, 'desc' for descending

// Default contestants if Google Sheets fails or returns no data
const defaultContestants = [
    { name: "Contestant 1", score: 0, oldScore: 0, taskScores: {}, portrait: 'images/blank.jpg' },
    { name: "Contestant 2", score: 0, oldScore: 0, taskScores: {}, portrait: 'images/blank.jpg' },
    { name: "Contestant 3", score: 0, oldScore: 0, taskScores: {}, portrait: 'images/blank.jpg' },
    { name: "Contestant 4", score: 0, oldScore: 0, taskScores: {}, portrait: 'images/blank.jpg' },
    { name: "Contestant 5", score: 0, oldScore: 0, taskScores: {}, portrait: 'images/blank.jpg' }
];
