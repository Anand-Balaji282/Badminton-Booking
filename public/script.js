// Global Firebase variables
let auth;
let db;
let currentUser = null;
let currentUserID = null;
let weeklyHoursUsed = 0;
let MAX_HOURS_PER_WEEK = 2;

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
// 1. AUTHENTICATION HANDLERS
// ----------------------------------------------------------------------

function setupFirebase() {
    if (typeof firebaseConfig === 'undefined') {
        showMessage('Error: Firebase config missing. Check index.html.', 'error');
        return;
    }
    
    // Use the Compat APIs for the provided SDKs
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    document.getElementById('loading').classList.add('hidden');
    
    // Check authentication state on load
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            currentUserID = user.uid;
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            document.getElementById('user-info').textContent = `Logged in as: ${user.displayName}`;
            
            initializeApp();
        } else {
            currentUser = null;
            currentUserID = null;
            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
        }
    });

    // Set up Google Sign-In button
    document.getElementById('google-login-btn').addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error("Sign-in error:", error);
            showMessage(`Sign-in Failed: ${error.message}`, 'error');
        });
    });

    // Set up Logout button
    document.getElementById('logout-btn').addEventListener('click', () => {
        auth.signOut();
    });
}


// ----------------------------------------------------------------------
// 2. DATA INITIALIZATION AND LIMITS
// ----------------------------------------------------------------------

// New corrected function to ensure the date is always read from the input
async function initializeApp() {
    // 1. Set up date picker defaults
    const dateInput = document.getElementById('date-select');
    const today = getCurrentDateString();
    
    // Set the default value and minimum date
    dateInput.value = today; 
    dateInput.min = today; 

    // 2. Initial display update
    // Read the value directly from the input element for consistency
    const initialDate = dateInput.value;
    document.getElementById('current-date').textContent = initialDate;
    
    // 3. Load user stats
    await loadUserStats(currentUserID);

    // 4. Load slots for the initial date
    updateSlotDisplay(initialDate); // Use the validated date string

    // 5. Set up date change listener
    dateInput.addEventListener('change', (e) => {
        document.getElementById('current-date').textContent = e.target.value;
        updateSlotDisplay(e.target.value);
    });
}

async function loadUserStats(uid) {
    if (!uid) return;

    // Check if the current week has passed (e.g., reset every Monday)
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - (now.getDay() || 7) + 1)); // Monday
    const startOfWeekTimestamp = firebase.firestore.Timestamp.fromDate(startOfWeek);

    try {
        const userRef = db.collection('users').doc(uid);
        const doc = await userRef.get();

        if (doc.exists) {
            const userData = doc.data();
            
            // Check if last reset was before the current week
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

        updateLimitDisplay();

    } catch (e) {
        console.error("Error loading user stats:", e);
        showMessage("Error loading your usage limits.", 'error');
    }
}

function updateLimitDisplay() {
    const hoursText = `${weeklyHoursUsed} / ${MAX_HOURS_PER_WEEK} hours`;
    document.getElementById('weekly-hours-used').textContent = hoursText;

    const limitStatus = document.getElementById('limit-status');
    if (weeklyHoursUsed >= MAX_HOURS_PER_WEEK) {
        limitStatus.textContent = 'LIMIT REACHED';
        limitStatus.className = 'text-xl font-bold text-red-700';
    } else {
        limitStatus.textContent = 'OK';
        limitStatus.className = 'text-xl font-bold text-green-700';
    }
}


// ----------------------------------------------------------------------
// 3. SLOT DISPLAY AND RENDERING
// ----------------------------------------------------------------------

async function updateSlotDisplay(dateString) {
    const container = document.getElementById('slots-container');
    container.innerHTML = 'Fetching slots...';
    
    const dateFirestore = formatDateForFirestore(dateString);
    if (!dateFirestore) {
        container.innerHTML = '<p class="text-center p-8 text-gray-500">Select a valid date.</p>';
        return;
    }

    try {
        // Query to get slots for the selected date
        // Note: This query requires a composite index on (date, time) in ascending order.
        const slotsRef = db.collection('slots');
        const q = slotsRef
            .where('date', '==', dateFirestore)
            .orderBy('time', 'asc');
        
        const snapshot = await q.get();
        let html = '';
        
        if (snapshot.empty) {
            // No slots defined for this day, offer a default structure (for admin setup)
            html = '<p class="text-center p-8 text-gray-500">No slots defined for this date. (Admin required to set up slots)</p>';
        } else {
            snapshot.forEach(doc => {
                const slot = doc.data();
                const slotID = doc.id;
                const slotKey = `${slot.time}`;
                
                const isBooked = slot.status === 'Booked';
                const isFull = slot.count >= 4;
                const isInWaitlist = slot.waitlist && slot.waitlist.includes(currentUserID);
                const isPlayer = slot.players && slot.players.includes(currentUserID);
                const isLocked = slot.time <= new Date().getHours(); // simple lock for past hours
                
                let buttonHTML = '';
                let statusColor = 'bg-green-100 text-green-700';
                let actionText = '';

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
                    actionText = 'Available';
                    statusColor = 'bg-green-100 text-green-700';
                    buttonHTML = `<button data-action="book" data-id="${slotID}" class="action-btn w-full py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition">Book Now</button>`;
                }

                html += `
                    <div class="bg-white p-4 rounded-lg shadow-md flex justify-between items-center ${statusColor}">
                        <div class="flex-grow">
                            <h3 class="text-xl font-bold">${formatTime(slotKey)}</h3>
                            <p class="text-sm">${actionText}</p>
                        </div>
                        <div class="text-right mr-4">
                            <p class="text-lg font-semibold">Players: ${slot.players ? slot.players.length : 0} / 4</p>
                            ${slot.waitlist && slot.waitlist.length > 0 ? 
                                `<p class="text-xs text-yellow-800">Waitlist: ${slot.waitlist.length}</p>` : ''}
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
        showMessage("Error fetching slots. Check your Firestore Index status.", 'error');
        container.innerHTML = '<p class="text-center p-8 text-red-500">Error loading data. Check console.</p>';
    }
}


// ----------------------------------------------------------------------
// 4. BOOKING AND CANCELLATION LOGIC
// ----------------------------------------------------------------------

function attachActionListeners() {
    document.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const slotID = e.target.dataset.id;
            
            if (action === 'book') handleBooking(slotID);
            else if (action === 'cancel') handleCancel(slotID);
            else if (action === 'waitlist') handleWaitlist(slotID);
            else if (action === 'waitlist-cancel') handleWaitlistCancel(slotID);
        });
    });
}

// Main booking handler (handles all slot updates)
async function handleBooking(slotID) {
    if (weeklyHoursUsed >= MAX_HOURS_PER_WEEK) {
        showMessage('Booking denied: Weekly limit reached.', 'error');
        return;
    }

    const slotRef = db.collection('slots').doc(slotID);
    const userRef = db.collection('users').doc(currentUserID);
    const selectedDate = document.getElementById('date-select').value;
    
    try {
        await db.runTransaction(async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const userDoc = await transaction.get(userRef);
            
            if (!slotDoc.exists) throw "Slot does not exist!";
            const slotData = slotDoc.data();
            
            // Check 1: User is already involved
            if (slotData.players && slotData.players.includes(currentUserID)) {
                throw new Error("You are already booked for this slot.");
            }
            if (slotData.waitlist && slotData.waitlist.includes(currentUserID)) {
                throw new Error("You are already on the waitlist for this slot.");
            }

            // Check 2: Max players reached
            if (slotData.players.length >= 4) {
                // Should be handled by UI, but double-check here
                throw new Error("Slot is full. Please join the waitlist.");
            }

            // Check 3: Usage Limit (redundant with initial check but safe)
            if ((userDoc.data().weeklyHours || 0) >= MAX_HOURS_PER_WEEK) {
                throw new Error("Booking denied: Weekly limit reached.");
            }

            // 1. Update Slot
            const newPlayers = [...(slotData.players || []), currentUserID];
            const newCount = newPlayers.length;
            
            transaction.update(slotRef, {
                players: newPlayers,
                count: newCount,
                status: newCount === 4 ? 'Full' : 'Booked',
            });
            
            // 2. Update User Hours
            const newHours = (userDoc.data().weeklyHours || 0) + 1;
            transaction.update(userRef, { weeklyHours: newHours });

            weeklyHoursUsed = newHours; // Update local state
        });
        
        // --- SUCCESS ---
        showMessage('Slot successfully booked! Hours updated.', 'success');
        
        // 🚨 CRUCIAL: Call the refresh function after successful transaction
        updateLimitDisplay();
        updateSlotDisplay(selectedDate);
        
    } catch (e) {
        const message = typeof e === 'string' ? e : e.message || 'An unknown error occurred during booking.';
        showMessage(`Error: ${message}`, 'error');
        console.error("Booking transaction failed:", e);
    }
}


// Waitlist handler (simpler transaction)
async function handleWaitlist(slotID) {
    const slotRef = db.collection('slots').doc(slotID);
    const selectedDate = document.getElementById('date-select').value;
    
    try {
        await db.runTransaction(async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            if (!slotDoc.exists) throw "Slot does not exist!";
            const slotData = slotDoc.data();
            
            if (slotData.waitlist && slotData.waitlist.includes(currentUserID)) {
                throw new Error("You are already on the waitlist.");
            }
            
            const newWaitlist = [...(slotData.waitlist || []), currentUserID];
            transaction.update(slotRef, { waitlist: newWaitlist });
        });
        
        showMessage('Successfully joined the waitlist!', 'success');
        updateSlotDisplay(selectedDate); // Refresh
        
    } catch (e) {
        showMessage(`Error joining waitlist: ${e.message || 'Unknown error.'}`, 'error');
    }
}


// Cancel handlers (booking and waitlist) would follow a similar structure with transaction updates.
// They would reduce the user's weeklyHours and update the slot's players/waitlist arrays.
// Example:
async function handleCancel(slotID) {
    const slotRef = db.collection('slots').doc(slotID);
    const userRef = db.collection('users').doc(currentUserID);
    const selectedDate = document.getElementById('date-select').value;
    
    try {
        await db.runTransaction(async (transaction) => {
            const slotDoc = await transaction.get(slotRef);
            const userDoc = await transaction.get(userRef);
            
            if (!slotDoc.exists) throw "Slot does not exist!";
            const slotData = slotDoc.data();

            // 1. Update Slot (Remove player)
            const newPlayers = (slotData.players || []).filter(uid => uid !== currentUserID);
            const newCount = newPlayers.length;
            
            transaction.update(slotRef, {
                players: newPlayers,
                count: newCount,
                status: newCount > 0 ? 'Booked' : 'Available',
            });
            
            // 2. Update User Hours
            const newHours = Math.max(0, (userDoc.data().weeklyHours || 0) - 1);
            transaction.update(userRef, { weeklyHours: newHours });
            
            weeklyHoursUsed = newHours; // Update local state
            
            // 3. Simple Waitlist promotion (immediate promotion upon cancel)
            if (slotData.waitlist && slotData.waitlist.length > 0 && newCount < 4) {
                const promotedUID = slotData.waitlist[0];
                const updatedWaitlist = slotData.waitlist.slice(1);
                const updatedPlayers = [...newPlayers, promotedUID];
                
                transaction.update(slotRef, {
                    players: updatedPlayers,
                    waitlist: updatedWaitlist,
                    count: updatedPlayers.length,
                    status: updatedPlayers.length === 4 ? 'Full' : 'Booked',
                });
                
                // NOTE: This simple promotion doesn't check the promoted user's weekly limit.
                // For production, this should be done in a Cloud Function.
                
                // Increment promoted user's hours
                const promotedUserRef = db.collection('users').doc(promotedUID);
                const promotedUserDoc = await transaction.get(promotedUserRef);
                const promotedNewHours = (promotedUserDoc.data().weeklyHours || 0) + 1;
                transaction.update(promotedUserRef, { weeklyHours: promotedNewHours });
            }
        });
        
        showMessage('Slot successfully cancelled. Hours reduced.', 'success');
        updateLimitDisplay();
        updateSlotDisplay(selectedDate); // Refresh
        
    } catch (e) {
        showMessage(`Error cancelling slot: ${e.message || 'Unknown error.'}`, 'error');
    }
}

// ----------------------------------------------------------------------
// 5. INITIALIZATION CALL
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', setupFirebase);
