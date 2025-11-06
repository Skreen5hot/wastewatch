document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const timeDisplay = document.getElementById('time-display');
    const costDisplay = document.getElementById('cost-display');
    const meetingNameDisplay = document.getElementById('meeting-name-display');
    const startPauseBtn = document.getElementById('startPauseBtn');
    const endBtn = document.getElementById('endBtn');
    const configureBtn = document.getElementById('configureBtn');
    const archiveList = document.getElementById('archive-list');
    const clearArchiveBtn = document.getElementById('clearArchiveBtn');

    // Modal Elements
    const configModal = document.getElementById('configModal');
    const configForm = document.getElementById('configForm');
    const meetingNameInput = document.getElementById('meetingName');
    const avgHourlyRateInput = document.getElementById('avgHourlyRate');
    const attendeesInput = document.getElementById('attendees');
    const saveAndStartBtn = document.getElementById('saveAndStartBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // --- App State ---
    let state = {
        timerInterval: null,
        startTime: 0,
        elapsedTime: 0,
        isRunning: false,
        currentMeeting: null, // { name, avgHourlyRate, attendees, attendeesCount }
    };

    // --- IndexedDB ---
    let db;
    const dbName = 'WasteWatchDB';
    const storeName = 'meetings';

    function initDB() {
        const request = indexedDB.open(dbName, 1);

        request.onerror = (event) => console.error('Database error:', event.target.errorCode);
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database initialized.');
            loadArchive();
        };

        request.onupgradeneeded = (event) => {
            let db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                const objectStore = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('timestampEnded', 'timestampEnded', { unique: false });
            }
        };
    }

    // --- Core Functions ---

    function formatTime(ms) {
        const totalMilliseconds = Math.floor(ms);
        const cs = Math.floor((totalMilliseconds % 1000) / 10).toString().padStart(2, '0');
        const totalSeconds = Math.floor(totalMilliseconds / 1000);
        const seconds = (totalSeconds % 60).toString().padStart(2, '0');
        const totalMinutes = Math.floor(totalSeconds / 60);
        const minutes = (totalMinutes % 60).toString().padStart(2, '0');
        const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}.${cs}`;
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }

    function calculateCost(ms) {
        if (!state.currentMeeting) return 0;
        const { attendeesCount, avgHourlyRate } = state.currentMeeting;
        const hours = ms / 3600000;
        return attendeesCount * avgHourlyRate * hours;
    }

    function updateDisplay() {
        const now = Date.now();
        state.elapsedTime = now - state.startTime;
        const currentCost = calculateCost(state.elapsedTime);

        timeDisplay.textContent = formatTime(state.elapsedTime);
        costDisplay.textContent = formatCurrency(currentCost);
    }

    function resetUI() {
        timeDisplay.textContent = formatTime(0);
        costDisplay.textContent = formatCurrency(0);
        meetingNameDisplay.textContent = 'No Meeting Configured';
        startPauseBtn.textContent = 'Start';
        startPauseBtn.disabled = true;
        endBtn.disabled = true;
    }

    function startTimer() {
        if (state.isRunning) return;
        state.startTime = Date.now() - state.elapsedTime;
        state.timerInterval = setInterval(updateDisplay, 100); // Update 10 times/sec
        state.isRunning = true;
        startPauseBtn.textContent = 'Pause';
    }

    function pauseTimer() {
        if (!state.isRunning) return;
        clearInterval(state.timerInterval);
        state.isRunning = false;
        startPauseBtn.textContent = 'Resume';
    }

    function endMeeting() {
        pauseTimer();
        const finalCost = calculateCost(state.elapsedTime);

        const meetingRecord = {
            name: state.currentMeeting.name,
            date: new Date().toISOString(),
            attendees: state.currentMeeting.attendees,
            avgHourlyRate: state.currentMeeting.avgHourlyRate,
            duration: state.elapsedTime,
            totalCost: finalCost,
            timestampCreated: state.startTime,
            timestampEnded: Date.now(),
        };

        const transaction = db.transaction([storeName], 'readwrite');
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.add(meetingRecord);

        request.onsuccess = () => {
            console.log('Meeting saved to DB.');
            loadArchive();
        };
        request.onerror = (e) => console.error('Error saving meeting:', e.target.error);

        // Reset state
        state.currentMeeting = null;
        state.elapsedTime = 0;
        resetUI();
    }

    // --- Archive Functions ---

    function loadArchive() {
        archiveList.innerHTML = 'Loading...';
        const transaction = db.transaction([storeName], 'readonly');
        const objectStore = transaction.objectStore(storeName);
        const index = objectStore.index('timestampEnded');
        const request = index.getAll(null, 'prev'); // Sort by most recent

        request.onsuccess = () => {
            const meetings = request.result;
            archiveList.innerHTML = '';
            if (meetings.length === 0) {
                archiveList.innerHTML = '<p>No meetings in archive.</p>';
                return;
            }
            meetings.forEach(meeting => {
                const item = document.createElement('div');
                item.className = 'archive-item';
                item.innerHTML = `
                    <div class="archive-item-header">${meeting.name}</div>
                    <div class="archive-item-details">
                        <span>${new Date(meeting.date).toLocaleString()}</span>
                        <span>Duration: ${formatTime(meeting.duration)}</span>
                        <span>Cost: ${formatCurrency(meeting.totalCost)}</span>
                    </div>
                `;
                archiveList.appendChild(item);
            });
        };
        request.onerror = (e) => {
            archiveList.innerHTML = '<p>Error loading archive.</p>';
            console.error('Error loading archive:', e.target.error);
        };
    }

    function clearArchive() {
        if (!confirm('Are you sure you want to clear the entire meeting archive? This cannot be undone.')) {
            return;
        }
        const transaction = db.transaction([storeName], 'readwrite');
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.clear();

        request.onsuccess = () => {
            console.log('Archive cleared.');
            loadArchive();
        };
        request.onerror = (e) => console.error('Error clearing archive:', e.target.error);
    }

    // --- Event Handlers ---

    // Navigation
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            tabContents.forEach(content => {
                content.id === tab ? content.classList.add('active') : content.classList.remove('active');
            });

            if (tab === 'archive') {
                loadArchive();
            }
        });
    });

    // Controls
    startPauseBtn.addEventListener('click', () => {
        if (state.isRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    });

    endBtn.addEventListener('click', endMeeting);
    clearArchiveBtn.addEventListener('click', clearArchive);

    // Modal
    configureBtn.addEventListener('click', () => {
        // Pre-fill with defaults
        const now = new Date();
        const defaultName = `${now.toLocaleDateString()} - Staff Sync`;
        meetingNameInput.value = localStorage.getItem('WasteWatch-meetingName') || defaultName;
        avgHourlyRateInput.value = localStorage.getItem('WasteWatch-avgHourlyRate') || '50.00';
        attendeesInput.value = localStorage.getItem('WasteWatch-attendees') || '';

        configModal.style.display = 'flex';
    });

    cancelBtn.addEventListener('click', () => {
        configModal.style.display = 'none';
    });

    configForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const attendeesList = attendeesInput.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

        if (attendeesList.length === 0) {
            alert('Please add at least one attendee.');
            return;
        }

        // Reset previous meeting state if any
        if (state.isRunning) pauseTimer();
        state.elapsedTime = 0;

        // Set new meeting config
        state.currentMeeting = {
            name: meetingNameInput.value,
            avgHourlyRate: parseFloat(avgHourlyRateInput.value),
            attendees: attendeesList,
            attendeesCount: attendeesList.length,
        };

        // Save defaults for next time
        localStorage.setItem('WasteWatch-meetingName', meetingNameInput.value);
        localStorage.setItem('WasteWatch-avgHourlyRate', avgHourlyRateInput.value);
        localStorage.setItem('WasteWatch-attendees', attendeesInput.value);

        // Update UI and start timer
        meetingNameDisplay.textContent = state.currentMeeting.name;
        startPauseBtn.disabled = false;
        endBtn.disabled = false;
        resetUI(); // Reset displays before starting
        timeDisplay.textContent = formatTime(0);
        costDisplay.textContent = formatCurrency(0);

        configModal.style.display = 'none';
        startTimer();
    });

    // Close modal if clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === configModal) {
            configModal.style.display = 'none';
        }
    });

    // --- Initialization ---
    initDB();
    resetUI();
});