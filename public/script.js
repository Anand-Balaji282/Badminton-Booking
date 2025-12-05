// Global Firebase variables
let db;
let MAX_HOURS_PER_WEEK = 2;
let globalUserName = null; // Store name once entered

// --- UTILITY FUNCTIONS ---
function getCurrentDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function formatDateForFirestore(dateString) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(/,/g, '').replace(/ /g, '-');
}

function formatTime(time) {
    return time.substring(0, 2) + ':00';
}

function showMessage(message, type) {
    const messageArea = document.getElementById('message-area');
    messageArea.textContent = message;
    messageArea.className = 'mt-6 p-3 text-sm rounded-lg text-center';
    
    if (type === 'error') {
        messageArea.classList.add('bg-red-100', 'text-red-800');
    } else {
        messageArea.classList.add('bg-green-100', 'text-green-800');
    }
    messageArea.classList.remove('hidden');

    setTimeout(() => {
        messageArea.classList.add('hidden');
    }, 5000);
}

// Function to prompt the user for their name
function promptForName() {
    // If the name is already stored globally, use it
    if (globalUserName) return globalUserName;
    
    let name = prompt("Please enter your name for booking:");
    if (name) {
        let cleanedName = name.trim().toLowerCase();
        globalUserName = cleanedName; // Store for the session
        return cleanedName;
    }
    return null;
}


// ----------------------------------------------------------------------
// 1. INIT & DATA LOAD
// ----------------------------------------------------------------------

function setupFirebase() {
    if (typeof firebaseConfig === 'undefined') {
        showMessage('Error: Firebase config missing. Check index.html.', 'error');
        return;
    }
    
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    document.getElementById('loading').classList.add('hidden');
    
    initializeApp();
}

async function initializeApp() {
    const dateInput = document.getElementById('date-select');
    const today = getCurrentDateString();
    
    dateInput.value = today; 
    dateInput.min = today; 

    const initialDate = dateInput.value;
    document.getElementById('current-date').textContent = initialDate;
    
    // Initial display of limits (set to 0 / OK on load, as name is unknown)
    document.getElementById('weekly-hours-used').textContent = `0 / ${MAX_HOURS_PER_WEEK} hours`;
    document.getElementById('limit-status').textContent = 'OK';
    
    updateSlotDisplay(initialDate); 

    dateInput.addEventListener('change', (e) => {
        document.getElementById('current-date').textContent = e.target.value;
        updateSlotDisplay(e.target.value);
    });
}

// Functionality to load and display limits based on the entered name
async function loadAndDisplayLimits(userName) {
    if (!userName) return 0;
    
    // Logic to calculate startOfWeek remains the same
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - (now.getDay() || 7) + 1));
    const startOfWeekTimestamp = firebase.firestore.Timestamp.fromDate(startOfWeek);
    let weeklyHoursUsed = 0;

    try {
        const userRef = db.collection('users').doc(userName);
        const doc = await userRef.get();

        if (doc.exists) {
            const userData = doc.data();
            
            // Weekly reset logic
            if (!userData.lastReset || userData.lastReset.toDate() < startOfWeekTimestamp.toDate()) {
                weeklyHoursUsed = 0;
                await userRef.set({ 
                    weeklyHours: 0, 
                    lastReset: firebase.firestore.Timestamp.fromDate(new Date()) 
                }, { merge: true });
            } else {
                weeklyHoursUsed = userData.weeklyHours || 0;
            }
        } else {
            // New user, create document
            await userRef.set({ weeklyHours: 0, lastReset: firebase.firestore.Timestamp.fromDate(new Date()) });
            weeklyHoursUsed = 0;
        }

        // --- UI Update ---
        const hoursText = `${weeklyHoursUsed} / ${MAX_HOURS_PER_WEEK} hours`;
        document.getElementById('weekly-hours-used').textContent = hoursText;
        
        const limitStatus = document.getElementById('limit-status');
        limitStatus.textContent = weeklyHoursUsed >= MAX_HOURS_PER_WEEK ? 'LIMIT REACHED' : 'OK';
        limitStatus.className = `text-xl font-bold mt-1 ${weeklyHoursUsed >= MAX_HOURS_PER_WEEK ? 'text-red-700' : 'text-green-700'}`;
        
        return weeklyHoursUsed;

    } catch (e) {
        console.error("Error loading user stats:", e);
        showMessage("Error loading usage limits.", 'error');
        return 0;
    }
}


// ----------------------------------------------------------------------
// 4. SLOT DISPLAY AND RENDERING (Crucial for page update)
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// 4. SLOT DISPLAY AND RENDERING (Corrected)
// ----------------------------------------------------------------------

async function updateSlotDisplay(dateString) {
    const container = document.getElementById('slots-container');
    container.innerHTML = 'Fetching slots...';
    
    const dateFirestore = formatDateForFirestore(dateString);
    if (!dateFirestore) {
        container.innerHTML = '<p class="text-center p-8 text-gray-500">Select a valid date.</p>';
        return;
    }

    // Get the current time for locking past slots
    const now = new Date();
    const todayString = getCurrentDateString();
    
    // Get the current user name from global state
    const userName = globalUserName || ''; 
    
    try {
        const slotsRef = db.collection('slots');
        const q = slotsRef
            .where('date', '==', dateFirestore)
            .orderBy('time', 'asc');
        
        const snapshot = await q.get();
        let html = '';
        
        if (snapshot.empty) {
            html = '<p class="text-center p-8 text-gray-500">No slots defined for this date.</p>';
        } else {
            snapshot.forEach(doc => {
                const slot = doc.data();
                const slotID = doc.id;
                
                const players = slot.players || [];
                const waitlist = slot.waitlist || [];
                
                const isFull = players.length >= 4;
                
                // --- FIX for Time Check ---
                // Only lock if the selected date is TODAY AND the time is in the past
                let isLocked = false;
                if (dateString === todayString) {
                    // Convert slot time (e.g., "1700") to number (17)
                    const slotHour = parseInt(slot.time.substring(0, 2)); 
                    isLocked = slotHour <= now.getHours(); 
                }
                // --------------------------

                // Check if the current session user is involved
                const isPlayer = userName && players.includes(userName);
                const isInWaitlist = userName && waitlist.includes(userName);
                
                let buttonHTML = '';
                let statusColor = 'bg-green-100 text-green-700';
                let actionText = 'Available';

                // ... (Rest of the rendering logic remains the same) ...
                if (isLocked) {
                    actionText = 'Time Passed';
                    statusColor = 'bg-gray-200 text-gray-600';
                    buttonHTML = `<button disabled class="w-full py-2 bg-gray-400 text-white rounded-md cursor-not-allowed">Closed</button>`;
                } else if (isPlayer) {
                    actionText = 'You Are BOOKED';
                    statusColor = 'bg-blue-100 text-blue-700';
                    buttonHTML = `<button data-action="cancel" data-id="${slotID}" class="action-btn w-full py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition">Cancel Slot</button>`;
                } else if (isFull) {
                    actionText = 'SLOT FULL';
                    statusColor = 'bg-yellow-100 text-yellow-700';
                    if (isInWaitlist) {
                         buttonHTML = `<button data-action="waitlist-cancel" data-id="${slotID}" class="action-btn w-full py-2 bg-orange-400 text-white rounded-md hover:bg-orange-500 transition">Leave Waitlist</button>`;
                    } else {
                         buttonHTML = `<button data-action="waitlist" data-id="${slotID}" class="action-btn w-full py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition">Join Waitlist</button>`;
                    }
                } else {
                    buttonHTML = `<button data-action="book" data-id="${slotID}" class="action-btn w-full py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition">Book Now</button>`;
                }
                // ... (HTML construction remains the same) ...
                
                html += `
                    <div class="bg-white p-4 rounded-lg shadow-md flex justify-between items-center ${statusColor}">
                        <div class="flex-grow">
                            <h3 class="text-xl font-bold">${formatTime(slot.time)}</h3>
                            <p class="text-sm">${actionText}</p>
                            <p class="text-xs mt-1 font-semibold text-gray-700">Booked: ${players.join(', ') || 'None'}</p>
                        </div>
                        <div class="text-right mr-4">
                            <p class="text-lg font-semibold">Spots: ${players.length} / 4</p>
                            ${waitlist.length > 0 ? 
                                `<p class="text-xs text-yellow-800">Waitlist: ${waitlist.length} (${waitlist.join(', ')})</p>` : ''}
                        </div>
                        <div class="w-1/4">
                            ${buttonHTML}
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        attachActionListeners();

    } catch (e) {
        console.error("FATAL ERROR FETCHING SLOTS:", e);
        // Display the error exactly as you see it now to avoid hiding a failure
        container.innerHTML = '<p class="text-center p-8 text-red-500">FATAL ERROR loading data. Check console.</p>';
    }
}


// ----------------------------------------------------------------------
// 5. BOOKING LOGIC (Now prompts for name)
// ----------------------------------------------------------------------

function attachActionListeners() {
    document.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const slotID = e.target.dataset.id;
            
            const userName = promptForName();
            if (!userName) return;

            // Only call the relevant handler based on action
            if (action === 'book') handleBooking(slotID, userName);
            // ... Add calls for cancel and waitlist handlers here
        });
    });
}

// Main booking handler
async function handleBooking(slotID, userName) {
    
    // 1. Check Usage Limit (Name-based check)
    const weeklyHoursUsed = await loadAndDisplayLimits(userName);
    if (weeklyHoursUsed >= MAX_HOURS_PER_WEEK) {
        showMessage('Booking denied: Weekly limit reached for ' + userName, 'error');
        return;
    }

    const slotRef = db.collection('slots').doc(slotID);
    const userRef = db.collection('users').doc(userName);
    const selectedDate = document.getElementById('date-select').value;
    
    try {
        await db.runTransaction(async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const userDoc = await transaction.get(userRef);
            
            if (!slotDoc.exists) throw "Slot does not exist!";
            const slotData = slotDoc.data();
            
            if (slotData.players && slotData.players.includes(userName)) {
                throw new Error("You are already booked for this slot.");
            }
            if (slotData.players.length >= 4) {
                throw new Error("Slot is full. Please join the waitlist.");
            }
            
            // 1. Update Slot
            const newPlayers = [...(slotData.players || []), userName];
            const newCount = newPlayers.length;
            
            transaction.update(slotRef, {
                players: newPlayers,
                count: newCount,
                status: newCount === 4 ? 'Full' : 'Booked',
            });
            
            // 2. Update User Hours (using name doc)
            const newHours = (userDoc.exists ? userDoc.data().weeklyHours || 0 : 0) + 1;
            transaction.set(userRef, { weeklyHours: newHours, lastReset: firebase.firestore.Timestamp.fromDate(new Date()) }, { merge: true });

        });
        
        // --- SUCCESS ---
        showMessage('Slot successfully booked for ' + userName + '!', 'success');
        
        // 🚨 CRUCIAL: Final display updates
        await loadAndDisplayLimits(userName); 
        updateSlotDisplay(selectedDate);
        
    } catch (e) {
        const message = typeof e === 'string' ? e : e.message || 'An unknown error occurred during booking.';
        showMessage(`Error: ${message}`, 'error');
        console.error("Booking transaction failed:", e);
    }
}


// ----------------------------------------------------------------------
// 6. INITIALIZATION CALL
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', setupFirebase);
