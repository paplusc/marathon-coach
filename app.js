// ----------------------------
// Marathon Coach - app.js
// Preserves your original logic; UI refreshed. Bugfixes applied:
//  - modal close-button remove bug
//  - next-Monday date calculation
// ----------------------------

/* Global state */
const APP_STATE = {
    currentView: 'dashboard', // 'dashboard', 'plan', 'log', 'detail'
    trainingPlan: [], // Array of plan rows
    loggedWorkouts: {}, // { 'YYYY-MM-DD': { plan: '...', log: {...} } }
    planStartDate: null, // YYYY-MM-DD string
    currentDetailDate: null // Date string for workout detail view
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_COLUMNS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // Matches CSV header order (Mon=1, Sun=7)

const LS_PLAN_KEY = 'marathonPlan';
const LS_LOGS_KEY = 'marathonLogs';
const LS_START_DATE_KEY = 'marathonStartDate';

// --- Utility Functions ---

/** Shows a custom modal message instead of using alert() */
function showModal(title, message) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('message-modal').classList.remove('hidden');
    // ensure lucide icons updated in modal (if any)
    if (window.lucide) lucide.createIcons();
}

/** Closes the custom modal */
function closeModal() {
    // Restore original click handler for "Close" button
    const closeButton = document.getElementById('modal-close-button');

    if (closeButton) {
        if (closeButton._originalOnClick) {
            closeButton.onclick = closeButton._originalOnClick;
            delete closeButton._originalOnClick;
        } else {
            closeButton.onclick = closeModal;
        }
        closeButton.textContent = "Close"; // Ensure text is reset from 'Yes, Delete' if needed
    }
    // Remove only the temporary cancel button if it exists (we set id 'modal-cancel-button')
    const tempCancel = document.getElementById('modal-cancel-button');
    if (tempCancel) tempCancel.remove();

    const modal = document.getElementById('message-modal');
    if (modal) modal.classList.add('hidden');
}

/** Formats a Date object to 'YYYY-MM-DD' string */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Parses 'YYYY-MM-DD' to Date object */
function parseDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Calculates the Week and Day for a given date based on the plan start date.
 * Assumes the plan starts on the first Monday.
 */
function getPlanDay(dateStr) {
    if (!APP_STATE.planStartDate || !APP_STATE.trainingPlan.length) {
        return { isPlanLoaded: false, date: dateStr };
    }

    const currentDate = parseDate(dateStr);
    const startDate = parseDate(APP_STATE.planStartDate);

    const diffTime = currentDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
        return { isPlanLoaded: true, week: 'Before Plan', dayName: DAY_NAMES[currentDate.getDay()], activity: 'Plan Not Started' };
    }

    const weekIndex = Math.floor(diffDays / 7);
    const dayOfWeekIndex = diffDays % 7; // 0=Mon, 1=Tue, ..., 6=Sun

    if (weekIndex >= APP_STATE.trainingPlan.length) {
        return { isPlanLoaded: true, week: `Week ${APP_STATE.trainingPlan.length + 1}+`, dayName: DAY_NAMES[currentDate.getDay()], activity: 'Plan Finished' };
    }

    const planRow = APP_STATE.trainingPlan[weekIndex];
    const dayKey = DAY_COLUMNS[dayOfWeekIndex];
    const activity = planRow ? planRow[dayKey] : 'Error';

    return {
        isPlanLoaded: true,
        week: planRow.Week, // e.g., "Week 1"
        dayName: DAY_COLUMNS[dayOfWeekIndex], // e.g., "Mon"
        activity: activity,
        log: APP_STATE.loggedWorkouts[dateStr] ? APP_STATE.loggedWorkouts[dateStr].log : null
    };
}

// --- Local Storage Functions ---

/** Loads data from local storage into the global state */
function loadState() {
    try {
        const planJson = localStorage.getItem(LS_PLAN_KEY);
        const logsJson = localStorage.getItem(LS_LOGS_KEY);
        const startString = localStorage.getItem(LS_START_DATE_KEY);

        if (planJson) {
            APP_STATE.trainingPlan = JSON.parse(planJson);
        }
        if (logsJson) {
            APP_STATE.loggedWorkouts = JSON.parse(logsJson);
        }
        if (startString) {
            APP_STATE.planStartDate = startString;
        }
    } catch (e) {
        console.error("Error loading state from localStorage:", e);
        showModal("Data Error", "Could not load saved data from your browser storage. It might be corrupted.");
    }
}

/** Saves the training plan and start date to local storage */
function savePlan(plan, startDate) {
    APP_STATE.trainingPlan = plan;
    APP_STATE.planStartDate = startDate;
    localStorage.setItem(LS_PLAN_KEY, JSON.stringify(plan));
    localStorage.setItem(LS_START_DATE_KEY, startDate);
    saveLogs(); // Ensure logs are saved if data was empty
}

/** Saves the logged workouts to local storage */
function saveLogs() {
    localStorage.setItem(LS_LOGS_KEY, JSON.stringify(APP_STATE.loggedWorkouts));
}

// --- CSV Parsing ---

/** Handles file selection and parsing */
function handleFileSelect(event) {
    const file = event.target.files[0];
    const startDateInput = document.getElementById('plan-start-date');
    const startDate = startDateInput.value;

    if (!startDate) {
        showModal("Error", "Please select a plan start date (Monday of Week 1) before importing the CSV.");
        event.target.value = null; // Clear file input
        return;
    }

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const csvContent = e.target.result;
                const plan = parseCSV(csvContent);
                if (plan.length > 0) {
                    savePlan(plan, startDate);
                    showModal("Success", `Successfully imported ${plan.length} weeks of training data, starting ${startDate}.`);
                    showView('dashboard'); // Go back to dashboard after import
                } else {
                    showModal("Error", "The CSV file was empty or could not be parsed.");
                }
            } catch (error) {
                console.error("CSV Parsing Error:", error);
                showModal("Error", "There was an error parsing the CSV file. Please check its format.");
            }
        };
        reader.readAsText(file);
    }
}

/** Parses the CSV string into an array of objects */
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== headers.length) continue;

        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index];
        });
        data.push(row);
    }
    return data;
}

// --- View Rendering ---

/** Main function to switch and render views */
function showView(view, data = {}) {
    APP_STATE.currentView = view;
    const container = document.getElementById('view-container');
    container.innerHTML = '';
    document.getElementById('view-plan-button').classList.toggle('hidden', view === 'plan' || view === 'log' || view === 'detail');
    document.getElementById('view-plan-button-text').textContent = view === 'plan' ? 'Back to Today' : 'View Full Plan';

    switch (view) {
        case 'dashboard':
            renderDashboard(container);
            break;
        case 'plan':
            renderPlanView(container);
            break;
        case 'import':
            renderImportView(container);
            break;
        case 'log':
            APP_STATE.currentDetailDate = data.date;
            renderLogForm(container, data.date);
            break;
        case 'detail':
            APP_STATE.currentDetailDate = data.date;
            renderWorkoutDetail(container, data.date);
            break;
        default:
            renderDashboard(container);
    }

    // refresh lucide icons after view swap
    if (window.lucide) lucide.createIcons();
}

/** Renders the Initial/Import View */
function renderImportView(container) {
    container.innerHTML = `
        <div class="glass-card p-6 md:p-10">
            <h2 class="text-2xl font-bold text-indigo-600 mb-4">Welcome, Future Marathoner!</h2>
            <p class="text-gray-600 mb-6">
                To get started, please upload your 24-week training plan CSV.
                The plan must start on a Monday, and the CSV headers should be:
                <code class="bg-gray-100 p-1 rounded text-sm font-mono">Week,Mon,Tue,Wed,Thu,Fri,Sat,Sun</code>
            </p>
            <div class="space-y-4">
                <label for="plan-start-date" class="block text-sm font-medium text-gray-700">
                    1. Select Plan Start Date (Monday of Week 1)
                </label>
                <input type="date" id="plan-start-date" class="w-full p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500">

                <label for="csv-file" class="block text-sm font-medium text-gray-700 pt-2">
                    2. Upload Training Plan CSV File
                </label>
                <input type="file" id="csv-file" accept=".csv" class="w-full text-gray-700
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-indigo-50 file:text-indigo-700
                    hover:file:bg-indigo-100
                ">
            </div>
        </div>
    `;
    document.getElementById('csv-file').addEventListener('change', handleFileSelect);

    // Set default start date to next Monday (corrected calculation)
    const today = new Date();
    const day = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // daysUntilNextMonday: number between 1..7 (if today is Monday, use next Monday)
    let daysUntilNextMonday = (1 - day + 7) % 7;
    if (daysUntilNextMonday === 0) daysUntilNextMonday = 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilNextMonday);
    document.getElementById('plan-start-date').value = formatDate(nextMonday);
}

/** Renders the Dashboard View (Today's Training) */
function renderDashboard(container) {
    if (!APP_STATE.trainingPlan.length) {
        renderImportView(container);
        return;
    }

    const todayStr = formatDate(new Date());
    const planDetails = getPlanDay(todayStr);

    const isLogged = planDetails.log !== null;
    const icon = isLogged ? '✅' : '🏃';
    const buttonText = isLogged ? 'View Log Details' : 'Log Today\'s Workout';
    const buttonColor = isLogged ? 'bg-green-500 hover:bg-green-600' : 'bg-indigo-500 hover:bg-indigo-600';
    const buttonAction = isLogged ? `showView('detail', { date: '${todayStr}' })` : `showView('log', { date: '${todayStr}' })`;

    container.innerHTML = `
        <div class="glass-card p-6 md:p-10 space-y-4">
            <h2 class="text-3xl font-bold text-gray-900 mb-2">Today is ${DAY_NAMES[new Date().getDay()]}</h2>
            <p class="text-lg text-gray-500">${todayStr}</p>

            <div class="border-t border-b border-gray-200 py-6 my-6">
                <p class="text-xl font-semibold text-indigo-600 mb-2">${planDetails.week}</p>
                <div class="flex items-center space-x-4">
                    <span class="text-6xl">${icon}</span>
                    <p class="text-4xl font-extrabold text-gray-900 leading-tight">${planDetails.activity}</p>
                </div>
            </div>

            <p class="text-sm text-gray-500">
                Plan started: ${APP_STATE.planStartDate ? new Date(APP_STATE.planStartDate).toLocaleDateString() : 'N/A'}
            </p>

            <button onclick="${buttonAction}" class="w-full flex justify-center items-center ${buttonColor} text-white font-bold py-3 rounded-lg shadow-md transition duration-150 ease-in-out mt-6">
                ${buttonText}
            </button>
            ${isLogged ? `
                <p class="text-center text-sm text-green-600 font-medium pt-2">Workout logged!</p>
            ` : ''}
        </div>
    `;
}

/** Renders the Log Workout Form View */
function renderLogForm(container, dateStr) {
    const planDetails = getPlanDay(dateStr);
    const isEdit = planDetails.log !== null;
    const logData = planDetails.log || {};

    // Get planned activity text, escape quotes for HTML
    const plannedActivity = planDetails.activity.replace(/"/g, '&quot;');

    // Determine where to go back to (Dashboard if today, Plan if past/future)
    const backAction = dateStr === formatDate(new Date()) ? 'dashboard' : 'plan';

    container.innerHTML = `
        <div class="glass-card p-6 md:p-10">
            <button onclick="showView('${backAction}')" class="text-sm text-indigo-600 mb-4 flex items-center hover:underline">
                &larr; Back to ${backAction === 'dashboard' ? 'Dashboard' : 'Full Plan'}
            </button>
            <h2 class="text-2xl font-bold text-gray-900 mb-1">${isEdit ? 'Edit' : 'Log'} Workout for ${dateStr}</h2>
            <p class="text-indigo-600 font-medium mb-6">${planDetails.week}: ${planDetails.activity}</p>

            <form id="workout-log-form" class="space-y-4">
                <div>
                    <label for="distance" class="block text-sm font-medium text-gray-700">Distance (km)</label>
                    <input type="number" id="distance" value="${logData.distance || ''}" step="0.1" required class="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm">
                </div>
                <div>
                    <label for="time" class="block text-sm font-medium text-gray-700">Time (HH:MM:SS)</label>
                    <input type="text" id="time" value="${logData.time || ''}" placeholder="e.g., 00:45:30" required class="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm">
                </div>
                <div>
                    <label for="pace" class="block text-sm font-medium text-gray-700">Avg Pace (min/km)</label>
                    <input type="text" id="pace" value="${logData.pace || ''}" placeholder="e.g., 5:15" required class="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm">
                </div>
                <div>
                    <label for="heartbeatAvg" class="block text-sm font-medium text-gray-700">Heartbeat Avg (BPM)</label>
                    <input type="number" id="heartbeatAvg" value="${logData.heartbeatAvg || ''}" class="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm">
                </div>
                <div>
                    <label for="stravaLink" class="block text-sm font-medium text-gray-700">Strava Link (Optional)</label>
                    <input type="url" id="stravaLink" value="${logData.stravaLink || ''}" placeholder="https://www.strava.com/activities/..." class="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm">
                </div>

                <button type="submit" class="w-full flex justify-center items-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition duration-150 ease-in-out mt-6">
                    ${isEdit ? 'Update Log' : 'Save Log'}
                </button>
            </form>
        </div>
    `;

    document.getElementById('workout-log-form').addEventListener('submit', (e) => {
        e.preventDefault();

        const log = {
            distance: parseFloat(document.getElementById('distance').value),
            time: document.getElementById('time').value,
            pace: document.getElementById('pace').value,
            heartbeatAvg: parseInt(document.getElementById('heartbeatAvg').value, 10) || null,
            stravaLink: document.getElementById('stravaLink').value
        };

        APP_STATE.loggedWorkouts[dateStr] = {
            plan: plannedActivity, // Store the planned activity text for context
            log: log
        };

        saveLogs();
        showModal("Success", `Workout for ${dateStr} has been successfully ${isEdit ? 'updated' : 'logged'}!`);

        // Override the modal's default close action to navigate away AFTER closing.
        const closeButton = document.getElementById('modal-close-button');

        if (closeButton) {
            // store original handler as a property (function) if not already stored
            if (!closeButton._originalOnClick) closeButton._originalOnClick = closeButton.onclick;
            closeButton.onclick = () => {
                closeModal();
                showView(backAction);
            };
        } else {
            console.error("Modal close button not found. Navigating immediately to prevent app hang.");
            showView(backAction);
        }
    });
}

/** Renders the Full Training Plan in a scrollable table */
function renderPlanView(container) {
    if (!APP_STATE.trainingPlan.length) {
        container.innerHTML = `
            <div class="text-center p-10 bg-white rounded-xl shadow">
                <p class="text-gray-600">No plan loaded. Please import a CSV file first.</p>
                <button onclick="showView('import')" class="mt-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg">
                    Go to Import
                </button>
            </div>
        `;
        return;
    }

    // Get the current day's week and day index for highlighting
    const todayStr = formatDate(new Date());
    const todayDetails = getPlanDay(todayStr);

    const tableRows = APP_STATE.trainingPlan.map((row, weekIndex) => {
        const dayCells = DAY_COLUMNS.map((dayKey, dayIndex) => {
            // Calculate the specific date for this cell
            const startDate = parseDate(APP_STATE.planStartDate);
            const cellDate = new Date(startDate.getTime());
            cellDate.setDate(startDate.getDate() + (weekIndex * 7) + dayIndex);
            const cellDateStr = formatDate(cellDate);

            const isCurrentDay = todayDetails.week === row.Week && dayKey === todayDetails.dayName;
            const isLogged = APP_STATE.loggedWorkouts[cellDateStr] !== undefined;

            let baseClasses = 'p-3 text-sm border border-gray-100 transition duration-150 ease-in-out cursor-pointer';
            let dayStyle = 'bg-white hover:bg-gray-50';
            let indicator = isLogged ? ' <span class="text-green-600 text-xs font-bold">✓</span>' : '';

            // Action: If logged, go to detail. If not logged, go to log form.
            const clickableAction = isLogged
                ? `onclick="showView('detail', { date: '${cellDateStr}' })"`
                : `onclick="showView('log', { date: '${cellDateStr}' })"`;


            if (isCurrentDay) {
                dayStyle = 'bg-yellow-100 font-bold border-yellow-300 shadow-inner';
            } else if (isLogged) {
                dayStyle = 'bg-green-50 hover:bg-green-100';
            }

            return `<td class="${baseClasses} ${dayStyle}" ${clickableAction}>${row[dayKey]}${indicator}</td>`;
        }).join('');

        return `
            <tr class="hover:bg-gray-50">
                <th class="p-3 text-sm font-semibold sticky left-0 bg-indigo-50 border border-gray-200 text-indigo-700">${row.Week}</th>
                ${dayCells}
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <button onclick="showView('dashboard')" class="text-sm text-indigo-600 mb-4 flex items-center hover:underline">
            &larr; Back to Today
        </button>
        <div class="bg-white p-4 md:p-6 rounded-xl shadow-xl border border-gray-100">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">24-Week Marathon Training Schedule</h2>
            <div class="scroll-table overflow-x-auto">
                <table class="w-full border-collapse table-auto">
                    <thead>
                        <tr class="bg-indigo-600 text-white text-left text-sm uppercase tracking-wider">
                            <th class="p-3 sticky left-0 bg-indigo-600">Week</th>
                            ${DAY_COLUMNS.map(day => `<th class="p-3">${day}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
            <p class="mt-4 text-xs text-gray-500">
                Click any day (past or future) to view or log a workout. Yellow highlight is today.
            </p>
        </div>
    `;
}

/** Renders the Workout Detail View */
function renderWorkoutDetail(container, dateStr) {
    const plannedActivity = APP_STATE.loggedWorkouts[dateStr]?.plan || 'N/A';
    const log = APP_STATE.loggedWorkouts[dateStr]?.log || {};

    // Determine where to go back to (Dashboard if today, Plan if past/future)
    const backAction = dateStr === formatDate(new Date()) ? 'dashboard' : 'plan';

    container.innerHTML = `
        <div class="glass-card p-6 md:p-10">
            <button onclick="showView('${backAction}')" class="text-sm text-indigo-600 mb-4 flex items-center hover:underline">
                &larr; Back to ${backAction === 'dashboard' ? 'Dashboard' : 'Full Plan'}
            </button>
            <h2 class="text-3xl font-bold text-gray-900 mb-2">Workout Log: ${dateStr}</h2>
            <p class="text-xl text-indigo-600 font-medium mb-6">Planned: ${plannedActivity}</p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-200 pt-6">
                ${[
                    { label: "Distance", value: log.distance ? `${log.distance} km` : 'N/A', icon: '📏' },
                    { label: "Time", value: log.time || 'N/A', icon: '⏱️' },
                    { label: "Avg Pace", value: log.pace || 'N/A', icon: '💨' },
                    { label: "Avg Heartbeat", value: log.heartbeatAvg ? `${log.heartbeatAvg} BPM` : 'N/A', icon: '❤️' },
                ].map(item => `
                    <div class="bg-gray-50 p-4 rounded-lg shadow-sm">
                        <p class="text-sm font-semibold text-gray-500">${item.label}</p>
                        <div class="flex items-center space-x-2 mt-1">
                            <span class="text-2xl">${item.icon}</span>
                            <p class="text-2xl font-extrabold text-gray-800">${item.value}</p>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="mt-6 pt-4 border-t border-gray-200">
                <p class="text-sm font-medium text-gray-700 mb-2">Strava Link</p>
                ${log.stravaLink ? `
                    <a href="${log.stravaLink}" target="_blank" class="text-blue-600 hover:text-blue-800 underline break-words">
                        ${log.stravaLink}
                    </a>
                ` : '<p class="text-gray-500 italic">No link provided.</p>'}
            </div>

            <div class="mt-8 flex space-x-4">
                <button onclick="showView('log', { date: '${dateStr}' })" class="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg shadow-md transition duration-150">
                    Edit Workout
                </button>
                <button onclick="deleteWorkout('${dateStr}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg shadow-md transition duration-150">
                    Delete Log
                </button>
            </div>
        </div>
    `;
}

/** Deletes a workout log and updates the view */
function deleteWorkout(dateStr) {
    // Determine where to go after deletion
    const nextView = dateStr === formatDate(new Date()) ? 'dashboard' : 'plan';

    showModal("Confirm Delete", `Are you sure you want to delete the workout log for ${dateStr}?`);

    // Temporarily change the "Close" button to perform deletion
    const closeButton = document.getElementById('modal-close-button');

    if (closeButton) {
        if (!closeButton._originalOnClick) closeButton._originalOnClick = closeButton.onclick;
        closeButton.textContent = "Yes, Delete";
        closeButton.onclick = () => {
            delete APP_STATE.loggedWorkouts[dateStr];
            saveLogs();
            closeModal();
            showModal("Deleted", `The log for ${dateStr} has been removed.`);
            showView(nextView); // Redirect to dashboard or full plan
        };
    }

    // Add a cancel button (only once) with a stable id so closeModal can remove it safely
    if (!document.getElementById('modal-cancel-button')) {
        const cancelButton = document.createElement('button');
        cancelButton.id = 'modal-cancel-button';
        cancelButton.textContent = "Cancel";
        cancelButton.className = "w-full mt-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 rounded-lg transition duration-150";
        cancelButton.onclick = () => {
            closeModal();
            showView('detail', { date: dateStr }); // Return to detail view if canceled
        };
        document.getElementById('modal-message').after(cancelButton);
    }
}

// --- Initialization ---

function init() {
    loadState();
    // Start the view. If no plan is loaded, it will default to the import view.
    showView('dashboard');

    // Initialize lucide icons
    if (window.lucide) lucide.createIcons();
}

// Initialize the app when the window is loaded
window.onload = init;
