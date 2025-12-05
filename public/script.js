// Global Firebase variables
let db;
let MAX_HOURS_PER_WEEK = 2;

// --- UTILITY FUNCTIONS (Remaining same) ---

// Helper to get the current date in YYYY-MM-DD format
function getCurrentDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Helper to format date for Firestore document ID (e.g., Dec-04-2025)
function formatDateForFirestore(dateString) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-');
    const date = new Date(year, month - 1, day);
    // Note: If using the original short-month-day-year format, ensure consistent date logic.
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).replace(/,/g, '').replace(/ /g, '-');
}

// Helper for time formatting
function formatTime(time) {
    return time.substring(0, 2) + ':00';
}

// Helper to show messages (success or error)
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

    // Hide after 5 seconds
    setTimeout(() => {
        messageArea.classList.add('hidden');
    }, 5000);
}

// ----------------------------------------------------------------------
// 1. AUTH REMOVAL & INIT
// ----------------------------------------------------------------------

function setupFirebase() {
    if (typeof firebaseConfig === 'undefined') {
        showMessage('Error: Firebase config missing. Check index.html.', 'error');
        return;
    }
    
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    document.getElementById('loading').classList.add('hidden');
    
    // Hide auth-related containers that are no longer needed
    const authContainer = document.getElementById('auth-container');
    if (authContainer) authContainer.classList.add('hidden');
    
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.classList.remove('hidden');

    // Remove logout button visibility (or remove the button from index.html)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    
    // Start the app directly
    initializeApp();
}

// Function to prompt the user for their name
function promptForName() {
    let name = prompt("Please enter your name for booking:");
    if (name) {
        // Clean up name for storage (trim and lowercase for case-insensitive tracking)
        return name.trim().toLowerCase();
    }
    return null;
}


// ----------------------------------------------------------------------
// 2. DATA INITIALIZATION AND LIMITS (Now uses name as ID)
// ----------------------------------------------------------------------

async function initializeApp() {
    const dateInput = document.getElementById('date-select');
    const today = getCurrentDateString();
    
    dateInput.value = today; 
    dateInput.min = today; 

    const initialDate = dateInput.value;
    document.getElementById('current-date').textContent = initialDate;
    
    // We cannot load user stats until the user attempts to book, 
    // but we can set up the date listener
    
    updateSlotDisplay(initialDate); 

    dateInput.addEventListener('change', (e) => {
        document.getElementById('current-date').textContent = e.target.value;
        updateSlotDisplay(e.target.value);
    });
}

// Functionality to load and display limits based on the entered name (if needed)
async function loadAndDisplayLimits(userName) {
    if (!userName) return 0;
    
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - (now.getDay() || 7) + 1)); // Monday
    const startOfWeekTimestamp = firebase.firestore.Timestamp.fromDate(startOfWeek);
    let weeklyHoursUsed = 0;

    try {
        const userRef = db.collection('users').doc(userName); // Use name as document ID
        const doc = await userRef.get();

        if (doc.exists) {
            const userData = doc.data();
            
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
            // First time user, create document
            await userRef.set({ 
                weeklyHours: 0, 
                lastReset: firebase.firestore.Timestamp.fromDate(new Date()) 
            });
            weeklyHoursUsed = 0;
        }

        const hoursText = `${weeklyHoursUsed} / ${MAX_HOURS_PER_WEEK} hours`;
        document.getElementById('weekly-hours-used').textContent = hoursText;
        
        const limitStatus = document.getElementById('limit-status');
        if (weeklyHoursUsed >= MAX_HOURS_PER_WEEK) {
            limitStatus.textContent = 'LIMIT REACHED';
        } else {
            limitStatus.textContent = 'OK';
        }
        
        return weeklyHoursUsed;

    } catch (e) {
        console.error("Error loading user stats:", e);
        showMessage("Error loading usage limits.", 'error');
        return 0;
    }
}


// ----------------------------------------------------------------------
// 3. SLOT DISPLAY AND RENDERING (Minimal changes, but crucial for reflection)
// ----------------------------------------------------------------------

async function updateSlotDisplay(dateString) {
    const container = document.getElementById('slots-container');
    container.innerHTML = 'Fetching slots...';
    
    const dateFirestore = formatDateForFirestore(dateString);
    if (!dateFirestore) {
        container.innerHTML = '<p class="text-center p-8 text-gray-500">Select a valid date.</p>';
        return;
    }
    
    // We get the username upon action, not on page load, 
    // so we can't fully personalize the view until the user performs an action.

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
                const slotKey = `${slot.time}`;
                
                // Now showing names instead of just checking UID
                const players = slot.players || [];
                const waitlist = slot.waitlist || [];
                
                const isFull = players.length >= 4;
                const isLocked = slot.time <= new Date().getHours(); 
                
                let buttonHTML = '';
                let statusColor = 'bg-green-100 text-green-700';
                let actionText = '';

                if (isLocked) {
                    actionText = 'Time Passed';
                    statusColor = 'bg-gray-200 text-gray-600';
                    buttonHTML = `<button disabled class="w-full py-2 bg-gray-400 text-white rounded-md cursor-not-allowed">Closed</button>`;
                } else if (isFull) {
                    actionText = 'SLOT FULL';
                    statusColor = 'bg-yellow-100 text-yellow-700';
                    buttonHTML = `<button data-action="waitlist" data-id="${slotID}" class="action-btn w-full py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition">Join Waitlist</button>`;
                } else {
                    actionText = 'Available';
                    statusColor = 'bg-green-100 text-green-700';
                    buttonHTML = `<button data-action="book" data-id="${slotID}" class="action-btn w-full py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition">Book Now</button>`;
                }

                html += `
                    <div class="bg-white p-4 rounded-lg shadow-md flex justify-between items-center ${statusColor}">
                        <div class="flex-grow">
                            <h3 class="text-xl font-bold">${formatTime(slotKey)}</h3>
                            <p class="text-sm">${actionText}</p>
                            <p class="text-xs mt-1">Booked: ${players.join(', ') || 'None'}</p>
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
        console.error("Error fetching slots:", e);
        showMessage("Error fetching slots. Final check: Is the Composite Index enabled?", 'error');
        container.innerHTML = '<p class="text-center p-8 text-red-500">Error loading data. Check console.</p>';
    }
}


// ----------------------------------------------------------------------
// 4. BOOKING AND CANCELLATION LOGIC (Now uses Name)
// ----------------------------------------------------------------------

function attachActionListeners() {
    document.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const slotID = e.target.dataset.id;
            
            const userName = promptForName();
            if (!userName) return;

            if (action === 'book') handleBooking(slotID, userName);
            // Cancel/Waitlist handlers would be added here
        });
    });
}

// Main booking handler (handles all slot updates)
async function handleBooking(slotID, userName) {
    const selectedDate = document.getElementById('date-select').value;
    
    // 1. Check Usage Limit (Name-based check)
    const weeklyHoursUsed = await loadAndDisplayLimits(userName);
    if (weeklyHoursUsed >= MAX_HOURS_PER_WEEK) {
        showMessage('Booking denied: Weekly limit reached for ' + userName, 'error');
        return;
    }

    const slotRef = db.collection('slots').doc(slotID);
    const userRef = db.collection('users').doc(userName);
    
    try {
        await db.runTransaction(async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const userDoc = await transaction.get(userRef);
            
            if (!slotDoc.exists) throw "Slot does not exist!";
            const slotData = slotDoc.data();
            
            // Check 1: User is already involved (using name)
            if (slotData.players && slotData.players.includes(userName)) {
                throw new Error("You are already booked for this slot.");
            }
            if (slotData.players.length >= 4) {
                // If full, force user to go to waitlist button instead
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
            const newHours = (userDoc.data().weeklyHours || 0) + 1;
            transaction.update(userRef, { weeklyHours: newHours });

        });
        
        // --- SUCCESS ---
        showMessage('Slot successfully booked for ' + userName + '!', 'success');
        
        // 🚨 CRUCIAL: Call the refresh function after successful transaction
        await loadAndDisplayLimits(userName); // Update the hours display
        updateSlotDisplay(selectedDate);
        
    } catch (e) {
        const message = typeof e === 'string' ? e : e.message || 'An unknown error occurred during booking.';
        showMessage(`Error: ${message}`, 'error');
        console.error("Booking transaction failed:", e);
    }
}


// ----------------------------------------------------------------------
// 5. INITIALIZATION CALL
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', setupFirebase);
