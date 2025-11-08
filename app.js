document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const timeDisplay = document.getElementById('time-display');
    const costDisplay = document.getElementById('cost-display');
    const meetingNameDisplay = document.getElementById('meeting-name-display');
    const startPauseBtn = document.getElementById('startPauseBtn');
    const endBtn = document.getElementById('endBtn');
    const miniplayerBtn = document.getElementById('miniplayerBtn');
    const configureBtn = document.getElementById('configureBtn');
    const archiveList = document.getElementById('archive-list');
    const clearArchiveBtn = document.getElementById('clearArchiveBtn');

    // Modal Elements
    const configModal = document.getElementById('configModal');
    const configForm = document.getElementById('configForm');
    const meetingNameInput = document.getElementById('meetingName');
    const saveAndStartBtn = document.getElementById('saveAndStartBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // Input Mode Elements
    const costInputModeRadios = document.querySelectorAll('input[name="inputMode"]');
    const simpleModeInputs = document.getElementById('simpleModeInputs');
    const detailedModeInputs = document.getElementById('detailedModeInputs');
    const attendeeListModeInputs = document.getElementById('attendeeListModeInputs');
    const avgHourlyRateSimpleInput = document.getElementById('avgHourlyRateSimple');
    const totalAttendeesInput = document.getElementById('totalAttendees');
    const roleInputsContainer = document.getElementById('roleInputsContainer');
    const addRoleBtn = document.getElementById('addRoleBtn');
    const avgHourlyRateListInput = document.getElementById('avgHourlyRateList');
    const attendeesInput = document.getElementById('attendees');

    const archiveDetailModal = document.getElementById('archiveDetailModal');
    const archiveDetailContent = document.getElementById('archiveDetailContent');
    const closeDetailBtn = document.getElementById('closeDetailBtn');



    // Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Chart Elements
    const trendsCanvas = document.getElementById('trendsChart');
    let trendsChart = null;

    // Miniplayer (Picture-in-Picture) Elements
    const miniplayerContent = document.getElementById('miniplayer-content');
    let pipWindow = null;
    // We need to get references to the elements *inside* the PiP window later
    let miniTimeDisplay, miniCostDisplay, miniMeetingNameDisplay;





    // --- App State ---
    let state = {
        timerInterval: null,
        startTime: 0,
        elapsedTime: 0,
        isRunning: false,
        currentMeeting: null, // { name, avgHourlyRate, attendees, attendeesCount }
    };
    let lastInputMode = 'list';

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

        // Also update the miniplayer if it's open
        if (pipWindow) {
            miniTimeDisplay.textContent = formatTime(state.elapsedTime);
            miniCostDisplay.textContent = formatCurrency(currentCost);
            miniMeetingNameDisplay.textContent = state.currentMeeting.name;
        }
    }

    function resetUI() {
        timeDisplay.textContent = formatTime(0);
        costDisplay.textContent = formatCurrency(0);
        meetingNameDisplay.textContent = 'No Meeting Configured';
        startPauseBtn.textContent = 'Start';
        startPauseBtn.disabled = true;
        endBtn.disabled = true;
        miniplayerBtn.disabled = true;
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

        // Close the miniplayer window if it's open
        if (pipWindow) {
            pipWindow.close();
        }
    }

    // --- Archive Functions ---

    function loadArchive() {
        archiveList.innerHTML = 'Loading...';
        const transaction = db.transaction([storeName], 'readonly');
        const objectStore = transaction.objectStore(storeName);
        const index = objectStore.index('timestampEnded');
        const meetings = [];
        // Use a cursor to get all objects in descending order
        const request = index.openCursor(null, 'prev');

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                meetings.push(cursor.value);
                cursor.continue();
            } else {
                // All items collected
                archiveList.innerHTML = '';
                if (meetings.length === 0) {
                archiveList.innerHTML = '<p>No meetings in archive.</p>';
                return;
            }
            meetings.forEach(meeting => {
                const item = document.createElement('div');
                item.className = 'archive-item';
                item.innerHTML = `
                    <div class="archive-item-header">${meeting.name} - ${new Date(meeting.date).toLocaleDateString()}</div>
                    <div class="archive-item-details">
                        <span>${new Date(meeting.date).toLocaleString()}</span>
                        <span>Duration: ${formatTime(meeting.duration)}</span>
                        <span>Cost: ${formatCurrency(meeting.totalCost)}</span>
                    </div>
                `;
                // Add click event to show details
                item.addEventListener('click', () => {
                    showArchiveDetail(meeting.id);
                });

                archiveList.appendChild(item);
            });
            }
        };
        request.onerror = (e) => {
            archiveList.innerHTML = '<p>Error loading archive.</p>';
            console.error('Error loading archive:', e.target.error);
        };
    }

    function showArchiveDetail(meetingId) {
        const transaction = db.transaction([storeName], 'readonly');
        const objectStore = transaction.objectStore(storeName);
        const request = objectStore.get(meetingId);

        request.onsuccess = (event) => {
            const meeting = event.target.result;
            if (!meeting) {
                console.error('Meeting not found');
                return;
            }

            const attendeesList = meeting.attendees.map(name => `<li>${name}</li>`).join('');

            archiveDetailContent.innerHTML = `
                <p><strong>Meeting:</strong> ${meeting.name}</p>
                <p><strong>Date:</strong> ${new Date(meeting.date).toLocaleString()}</p>
                <p><strong>Duration:</strong> ${formatTime(meeting.duration)}</p>
                <p><strong>Total Cost:</strong> ${formatCurrency(meeting.totalCost)}</p>
                <p><strong>Avg. Hourly Rate:</strong> ${formatCurrency(meeting.avgHourlyRate)}</p>
                <p><strong>Attendees (${meeting.attendees.length}):</strong></p>
                <ul>${attendeesList}</ul>
            `;

            archiveDetailModal.style.display = 'flex';
        };

        request.onerror = (e) => {
            console.error('Error fetching meeting details:', e.target.error);
            alert('Could not load meeting details.');
        };
    }

    function renderTrendsChart() {
        // Get CSS variable colors for the chart
        const computedStyles = getComputedStyle(document.documentElement);
        const pipboyGreen = computedStyles.getPropertyValue('--pipboy-green').trim();
        const glowColor = computedStyles.getPropertyValue('--glow-color').trim();

        const transaction = db.transaction([storeName], 'readonly');
        const objectStore = transaction.objectStore(storeName);
        const index = objectStore.index('timestampEnded');
        const meetings = [];

        // Use cursor to get all meetings, sorted by date
        index.openCursor(null, 'next').onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                meetings.push(cursor.value);
                cursor.continue();
            } else {
                // All data fetched, now create chart
                if (trendsChart) {
                    trendsChart.destroy(); // Clear previous chart instance
                }

                const labels = meetings.map(m => new Date(m.date).toLocaleDateString());
                const data = meetings.map(m => m.totalCost);

                trendsChart = new Chart(trendsCanvas, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Cost Per Meeting',
                            data: data,
                            borderColor: pipboyGreen,
                            backgroundColor: glowColor,
                            tension: 0.1,
                            pointBackgroundColor: pipboyGreen,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: { color: pipboyGreen }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) {
                                            label += ': ';
                                        }
                                        if (context.parsed.y !== null) {
                                            label += formatCurrency(context.parsed.y);
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { ticks: { color: pipboyGreen }, grid: { color: 'rgba(0, 255, 102, 0.1)' } },
                            y: { ticks: { color: pipboyGreen, callback: value => formatCurrency(value) }, grid: { color: 'rgba(0, 255, 102, 0.1)' } }
                        }
                    }
                });
            }
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
            if (tab === 'trends') {
                renderTrendsChart();
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
    miniplayerBtn.addEventListener('click', toggleMiniplayer);
    addRoleBtn.addEventListener('click', addRoleGroup);
    roleInputsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-remove-role')) {
            e.target.closest('.role-group').remove();
        }
    });
    // Add event listener for auto-filling role rates
    roleInputsContainer.addEventListener('input', (e) => {
        const target = e.target;
        if (target && target.matches('input[id^="roleName"]')) {
            handleRoleInput(target);
        } else if (target && target.matches('input[id^="roleRate"]')) { // Save on rate change too
            saveRoleRate(e.target);
        }
    });

    // Modal
    configureBtn.addEventListener('click', () => {
        // Pre-fill with defaults
        const now = new Date();
        const defaultName = `${now.toLocaleDateString()} - Staff Sync`;
        meetingNameInput.value = localStorage.getItem('WasteWatch-meetingName') || defaultName;
        avgHourlyRateListInput.value = localStorage.getItem('WasteWatch-avgHourlyRateList') || '50.00';
        attendeesInput.value = localStorage.getItem('WasteWatch-attendees') || '';
        avgHourlyRateSimpleInput.value = localStorage.getItem('WasteWatch-avgHourlyRateSimple') || '50.00';
        totalAttendeesInput.value = localStorage.getItem('WasteWatch-totalAttendees') || '5';

        // Restore last used mode
        lastInputMode = localStorage.getItem('WasteWatch-lastInputMode') || 'list';
        document.querySelector(`input[name="inputMode"][value="${lastInputMode}"]`).checked = true;
        handleModeChange();

        configModal.style.display = 'flex';
        if (lastInputMode === 'detailed' && roleInputsContainer.children.length === 0) addRoleGroup();
    });

    cancelBtn.addEventListener('click', () => {
        configModal.style.display = 'none';
    });

    configForm.addEventListener('submit', (e) => {
        e.preventDefault();

        let attendeesList = [];
        let attendeesCount = 0;
        let avgHourlyRate = 0;

        const selectedMode = document.querySelector('input[name="inputMode"]:checked').value;

        // --- Calculate cost based on active mode ---
        if (selectedMode === 'list') {
            attendeesList = attendeesInput.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
            attendeesCount = attendeesList.length;
            avgHourlyRate = parseFloat(avgHourlyRateListInput.value);
            localStorage.setItem('WasteWatch-avgHourlyRateList', avgHourlyRateListInput.value);
            localStorage.setItem('WasteWatch-attendees', attendeesInput.value);
        } else if (selectedMode === 'simple') {
            attendeesCount = parseInt(totalAttendeesInput.value, 10);
            avgHourlyRate = parseFloat(avgHourlyRateSimpleInput.value);
            for (let i = 1; i <= attendeesCount; i++) {
                attendeesList.push(`Attendee ${i}`);
            }
            localStorage.setItem('WasteWatch-avgHourlyRateSimple', avgHourlyRateSimpleInput.value);
            localStorage.setItem('WasteWatch-totalAttendees', totalAttendeesInput.value);
        } else if (selectedMode === 'detailed') {
            const roleGroups = roleInputsContainer.querySelectorAll('.role-group');
            let totalCostPerHour = 0;
            roleGroups.forEach(group => {
                const count = parseInt(group.querySelector('input[id^="roleCount"]').value, 10);
                const rate = parseFloat(group.querySelector('input[id^="roleRate"]').value);
                const name = group.querySelector('input[id^="roleName"]').value || 'Unnamed Role';
                
                attendeesCount += count;
                totalCostPerHour += count * rate;

                for (let i = 1; i <= count; i++) {
                    attendeesList.push(`${name} ${i}`);
                }
            });
            avgHourlyRate = attendeesCount > 0 ? totalCostPerHour / attendeesCount : 0;
        }

        if (attendeesCount === 0) {
            alert('Please configure at least one attendee.');
            return;
        }

        // Save last used mode
        localStorage.setItem('WasteWatch-lastInputMode', selectedMode);

        // Reset previous meeting state if any
        if (state.isRunning) pauseTimer();
        state.elapsedTime = 0;

        // Set new meeting config
        state.currentMeeting = {
            name: meetingNameInput.value,
            avgHourlyRate: avgHourlyRate,
            attendees: attendeesList,
            attendeesCount: attendeesCount,
        };

        // Save defaults for next time
        localStorage.setItem('WasteWatch-meetingName', meetingNameInput.value);

        // Reset displays before starting
        resetUI(); 

        // Update UI and start timer
        meetingNameDisplay.textContent = state.currentMeeting.name;
        startPauseBtn.disabled = false;
        endBtn.disabled = false;
        miniplayerBtn.disabled = false;
        timeDisplay.textContent = formatTime(0);
        costDisplay.textContent = formatCurrency(0);

        configModal.style.display = 'none';
        startTimer();
    });

    // --- Input Mode Logic ---
    costInputModeRadios.forEach(radio => radio.addEventListener('change', handleModeChange));

    function handleModeChange() {
        const selectedMode = document.querySelector('input[name="inputMode"]:checked').value;

        // Hide all containers
        simpleModeInputs.style.display = 'none';
        detailedModeInputs.style.display = 'none';
        attendeeListModeInputs.style.display = 'none';

        // Disable 'required' on all inputs first
        [...simpleModeInputs.querySelectorAll('input')].forEach(el => el.required = false);
        [...detailedModeInputs.querySelectorAll('input')].forEach(el => el.required = false);
        [...attendeeListModeInputs.querySelectorAll('input, textarea')].forEach(el => el.required = false);

        // Show the selected container and enable 'required'
        if (selectedMode === 'simple') {
            simpleModeInputs.style.display = 'block';
            [...simpleModeInputs.querySelectorAll('input')].forEach(el => el.required = true);
        } else if (selectedMode === 'detailed') {
            detailedModeInputs.style.display = 'block';
            [...detailedModeInputs.querySelectorAll('input')].forEach(el => el.required = true);
            // Add a default role if none exist
            if (roleInputsContainer.children.length === 0) {
                addRoleGroup();
            }
        } else { // 'list'
            attendeeListModeInputs.style.display = 'block';
            [...attendeeListModeInputs.querySelectorAll('input, textarea')].forEach(el => el.required = true);
        }
    }

    function addRoleGroup() {
        const roleId = Date.now(); // Unique ID for the new group
        const newRoleGroup = document.createElement('div');
        newRoleGroup.className = 'role-group';
        newRoleGroup.dataset.roleId = roleId;

        newRoleGroup.innerHTML = `
            <div class="form-group">
                <label for="roleName_${roleId}">Role Name</label>
                <div class="autocomplete-container">
                    <input type="text" id="roleSuggestion_${roleId}" class="role-suggestion-input" disabled tabindex="-1">
                    <input type="text" id="roleName_${roleId}" class="role-name-input" placeholder="e.g., Engineer" required autocomplete="off">
                </div>
            </div>
            <div class="form-group">
                <label for="roleRate_${roleId}">Rate ($/hr)</label>
                <input type="number" id="roleRate_${roleId}" step="0.01" min="0" value="60" required>
            </div>
            <div class="form-group">
                <label for="roleCount_${roleId}">Count</label>
                <input type="number" id="roleCount_${roleId}" min="1" value="1" required>
            </div>
            <button type="button" class="btn-remove-role">X</button> 
        `;

        // Don't allow removing the last role group
        if (roleInputsContainer.children.length === 0) {
            newRoleGroup.querySelector('.btn-remove-role').style.display = 'none';
        } else {
            // Ensure the first one can't be removed if it's now the only one
            if (roleInputsContainer.children.length === 1) {
                 roleInputsContainer.querySelector('.btn-remove-role').style.display = 'block';
            }
        }
        roleInputsContainer.appendChild(newRoleGroup);
    }
    
    function handleRoleInput(userInput) {
        const roleGroup = userInput.closest('.role-group');
        if (!roleGroup) return;
    
        const suggestionInput = roleGroup.querySelector('.role-suggestion-input');
        const currentText = userInput.value;
        const savedRates = JSON.parse(localStorage.getItem('WasteWatch-roleRates')) || {};
        
        if (!currentText) {
            suggestionInput.value = '';
            return;
        }
    
        const match = Object.keys(savedRates).find(role => role.toLowerCase().startsWith(currentText.toLowerCase()));
    
        if (match && match.toLowerCase() !== currentText.toLowerCase()) {
            suggestionInput.value = currentText + match.substring(currentText.length);
            console.log('Suggestion generated:', suggestionInput.value);
        } else {
            suggestionInput.value = '';
            console.log('No suggestion found.');
        }
    }
    
    // Handle Tab/Enter to accept suggestion
    roleInputsContainer.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' && e.key !== 'Enter') return;
    
        const userInput = e.target;
        if (!userInput.matches('input[id^="roleName"]')) return;
    
        const roleGroup = userInput.closest('.role-group');
        if (!roleGroup) return;
    
        const suggestionInput = roleGroup.querySelector('.role-suggestion-input');
        if (suggestionInput.value) {
            e.preventDefault();
            userInput.value = suggestionInput.value;
            suggestionInput.value = '';
            autofillRoleRate(userInput);
            saveRoleRate(roleGroup.querySelector('input[id^="roleRate"]'));
        }
    });

    function saveRoleRate(rateInput) {
        const roleGroup = rateInput.closest('.role-group');
        if (!roleGroup) return;

        const roleNameInput = roleGroup.querySelector('input[id^="roleName"]');
        const roleName = roleNameInput.value.trim();
        const rate = parseFloat(rateInput.value);

        if (roleName && !isNaN(rate)) {
            const savedRates = JSON.parse(localStorage.getItem('WasteWatch-roleRates')) || {};
            savedRates[roleName] = rate;
            localStorage.setItem('WasteWatch-roleRates', JSON.stringify(savedRates));
        }
    }

    function autofillRoleRate(roleNameInput) {
        const roleGroup = roleNameInput.closest('.role-group');
        if (!roleGroup) return;

        const rateInput = roleGroup.querySelector('input[id^="roleRate"]');
        const roleName = roleNameInput.value.trim();
        const savedRates = JSON.parse(localStorage.getItem('WasteWatch-roleRates')) || {};

        if (roleName && savedRates[roleName]) {
            rateInput.value = savedRates[roleName];
        }
    }

    // --- Miniplayer (Picture-in-Picture) Logic ---
    async function toggleMiniplayer() {
        if (!('documentPictureInPicture' in window)) {
            alert('Your browser does not support the Picture-in-Picture API. Please use a modern browser like Chrome or Edge.');
            return;
        }

        if (pipWindow) {
            pipWindow.close();
            return;
        }

        try {
            pipWindow = await window.documentPictureInPicture.requestWindow({
                width: 250,
                height: 150,
            });

            // Copy styles to the new window
            [...document.styleSheets].forEach((styleSheet) => {
                const css = styleSheet.ownerNode.cloneNode(true);
                pipWindow.document.head.appendChild(css);
            });

            // Move content and get references to the new elements
            pipWindow.document.body.append(miniplayerContent);
            // Make the content visible inside the PiP window
            miniplayerContent.style.display = 'block';

            miniTimeDisplay = pipWindow.document.getElementById('mini-time-display');
            miniCostDisplay = pipWindow.document.getElementById('mini-cost-display');
            miniMeetingNameDisplay = pipWindow.document.getElementById('mini-meeting-name-display');

            // When the PiP window is closed by the user
            pipWindow.addEventListener('pagehide', () => {
                document.body.append(miniplayerContent); // Move content back
                // Hide it again when it's back in the main document
                miniplayerContent.style.display = 'none';
                pipWindow = null;
            });
        } catch (error) {
            console.error('Error opening miniplayer:', error);
        }
    }

    // Close modal if clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === configModal ) {
            configModal.style.display = 'none';
        }
        if (event.target === archiveDetailModal) {
            archiveDetailModal.style.display = 'none';
        }
    });

    // Close detail modal with button
    closeDetailBtn.addEventListener('click', () => archiveDetailModal.style.display = 'none');

    // --- PWA Service Worker Registration ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((reg) => console.log('Service worker registered.', reg))
                .catch((err) => console.log('Service worker not registered.', err));
        });
    }


    // --- Initialization ---
    initDB();
    resetUI();
});