// Global Firebase instances
let auth;
let db;
let currentUser = null;
const MAX_MAIN_SPOTS = 10;
const MAX_WEEKLY_HOURS = 2;

// --- Utility Functions ---

/** Converts Date object to 'YYYY-MM-DD' string */
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

/** Determines the start of the current week (Monday) in UTC midnight. */
function getStartOfWeek(dateString) {
    const d = new Date(dateString + 'T00:00:00Z'); // Ensure UTC for consistency
    const day = d.getUTCDay();
    // Calculate difference (0=Sun, 1=Mon, ..., 6=Sat). We want Monday (1).
    // If today is Sunday (0), we need to go back 6 days. Otherwise, go back (day - 1) days.
    const diff = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - diff);
    // Set to 00:00:00.000 UTC
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/** Calculates hours used this week. */
async function getWeeklyHoursUsed(uid) {
    const today = formatDate(new Date());
    const startOfWeek = getStartOfWeek(today);

    // Get all bookings for the user since the start of the week
    const bookingsSnapshot = await db.collection('bookings')
        .where('players', 'array-contains', uid)
        .where('date', '>=', formatDate(startOfWeek))
        .get();

    let hoursUsed = 0;
    bookingsSnapshot.forEach(doc => {
        // Since each slot is 1 hour, count the number of documents/slots
        hoursUsed += 1; 
    });

    return hoursUsed;
}

// --- UI Rendering Functions ---

function displayMessage(message, isError = false) {
    const messageArea = document.getElementById('message-area');
    messageArea.textContent = message;
    messageArea.className = `mt-6 p-3 text-sm rounded-lg text-center ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
    messageArea.classList.remove('hidden');
    setTimeout(() => messageArea.classList.add('hidden'), 5000);
}

function updateStats(hoursUsed) {
    const statusText = hoursUsed >= MAX_WEEKLY_HOURS ? 'Limit Reached' : `${MAX_WEEKLY_HOURS - hoursUsed} hours left`;
    const statusClass = hoursUsed >= MAX_WEEKLY_HOURS ? 'font-bold text-red-600' : 'font-bold text-green-600';

    document.getElementById('weekly-hours-used').textContent = `${hoursUsed} / ${MAX_WEEKLY_HOURS} hours`;
    document.getElementById('limit-status').textContent = statusText;
    document.getElementById('limit-status').className = 'text-xl ' + statusClass;
}

function renderSlots(date, slotsData) {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    const slots = ['17:00', '18:00', '19:00']; // 5-6 PM, 6-7 PM, 7-8 PM

    slots.forEach(time => {
        const slotKey = `${date}-${time}`;
        const data = slotsData[slotKey] || { main: [], waitlist: [] };
        const mainList = data.main || [];
        const waitlist = data.waitlist || [];
        const isUserInMain = currentUser && mainList.includes(currentUser.uid);
        const isUserInWaitlist = currentUser && waitlist.includes(currentUser.uid);
        const isFull = mainList.length >= MAX_MAIN_SPOTS;

        // Calculate time until slot starts in minutes
        const [hour, minute] = time.split(':').map(Number);
        const slotStart = new Date(`${date}T${time}:00`);
        const now = new Date();
        const minutesUntilStart = (slotStart.getTime() - now.getTime()) / (1000 * 60);
        const isPast = minutesUntilStart < 0;

        let actionButton;
        let mainListClass = 'slot-card bg-white p-4 rounded-lg shadow-md';
        
        if (isUserInMain) {
            actionButton = `<button class="booking-btn btn-cancel" data-key="${slotKey}" data-action="cancel" ${isPast ? 'disabled' : ''}>Cancel Booking</button>`;
            mainListClass += ' is-booked';
        } else if (isUserInWaitlist) {
            actionButton = `<button class="booking-btn btn-cancel" data-key="${slotKey}" data-action="cancel_waitlist" ${isPast ? 'disabled' : ''}>Cancel Waitlist</button>`;
            mainListClass += ' bg-yellow-50'; // Neutral background for waitlist
        } else if (isPast) {
             actionButton = `<button class="booking-btn bg-gray-400 text-white" disabled>Time Passed</button>`;
        } else if (isFull) {
            actionButton = `<button class="booking-btn btn-waitlist" data-key="${slotKey}" data-action="waitlist">Join Waitlist</button>`;
            mainListClass += ' is-full';
        } else {
            actionButton = `<button class="booking-btn btn-book" data-key="${slotKey}" data-action="book">Book Slot</button>`;
        }
        
        // Waitlist Promotion Status (only visible if the slot is approaching the 2-hour window)
        let promotionStatus = '';
        if (minutesUntilStart > 0 && minutesUntilStart <= 120 && isFull && waitlist.length > 0) {
            // This is where the promotion check should run in a real backend, 
            // but we'll flag it in the UI as a pending promotion check.
            promotionStatus = `<div class="waitlist-banner mt-2">Promotion Check Triggered: Spots may open soon!</div>`;
        }


        const slotHtml = `
            <div class="${mainListClass}">
                <div class="flex justify-between items-start mb-3">
                    <h3 class="text-xl font-bold text-gray-800">${time} - ${parseInt(time.split(':')[0]) + 1}:00 PM</h3>
                    ${actionButton}
                </div>
                
                <p class="text-sm font-semibold text-gray-600 mb-2">Main List (${mainList.length}/${MAX_MAIN_SPOTS}):</p>
                <div class="space-y-1 text-sm text-gray-700">
                    ${mainList.length > 0 ? mainList.map(uid => `<span class="${uid === currentUser?.uid ? 'font-bold text-blue-700' : ''}">${uid.substring(0, 5)}...</span>`).join(', ') : 'No bookings yet.'}
                </div>
                
                <p class="text-sm font-semibold text-gray-600 mt-3 mb-2">Waitlist (${waitlist.length}):</p>
                <div class="space-y-1 text-sm text-gray-700">
                    ${waitlist.length > 0 ? waitlist.map(uid => `<span class="${uid === currentUser?.uid ? 'font-bold text-blue-700' : ''}">${uid.substring(0, 5)}...</span>`).join(', ') : 'Waitlist is empty.'}
                </div>

                ${promotionStatus}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', slotHtml);
    });
}

// --- Main Database Listener and Booking Functions ---

function setupBookingListener(date) {
    // 1. Fetch current user's weekly hours
    getWeeklyHoursUsed(currentUser.uid).then(updateStats);

    // 2. Set up real-time listener for the selected date's slots
    const bookingsRef = db.collection('slots').doc(date);

    // Use onSnapshot for real-time updates
    bookingsRef.onSnapshot(doc => {
        if (doc.exists) {
            renderSlots(date, doc.data());
        } else {
            // If document doesn't exist, render empty slots
            renderSlots(date, {});
        }
        // Re-check stats after every data change
        getWeeklyHoursUsed(currentUser.uid).then(updateStats);
    }, err => {
        console.error('Error fetching slots:', err);
        displayMessage('Error loading slots data. Please try refreshing.', true);
    });
    
    // 3. **CRITICAL: Implement Waitlist Promotion Check**
    // This is the function that handles the 2-hour-prior promotion logic.
    // In a production environment, this should run on a server (like Firebase Functions)
    // to execute reliably, but for this client-side example, we'll simulate the check on load.
    
    // WARNING: For client-side logic, this only runs when a user loads the page.
    // A reliable solution requires a server-side trigger (Firebase Function).
    const slots = ['17:00', '18:00', '19:00'];
    slots.forEach(time => {
        const slotKey = `${date}-${time}`;
        const slotStart = new Date(`${date}T${time}:00`);
        const now = new Date();
        const minutesUntilStart = (slotStart.getTime() - now.getTime()) / (1000 * 60);

        if (minutesUntilStart > 0 && minutesUntilStart <= 120) {
            // This is the 2-hour window! Run the promotion logic.
            // We use a transaction to ensure atomic updates.
            promoteWaitlist(slotKey, doc.data() ? doc.data()[slotKey] : undefined);
        }
    });
}

/** Handles the complex waitlist promotion logic. */
async function promoteWaitlist(slotKey, slotData) {
    if (!slotData) return;
    
    const [date, time] = slotKey.split('-');
    const mainList = slotData.main || [];
    const waitlist = slotData.waitlist || [];
    
    if (mainList.length < MAX_MAIN_SPOTS && waitlist.length > 0) {
        let promotedUid = null;
        let priorityPromoted = false;
        
        // 1. Try to find the first user on the waitlist with < 2 hours
        for (const uid of waitlist) {
            const hoursUsed = await getWeeklyHoursUsed(uid); // Expensive check
            if (hoursUsed < MAX_WEEKLY_HOURS) {
                promotedUid = uid;
                priorityPromoted = true;
                break;
            }
        }
        
        // 2. If no one qualifies by priority, promote the very first person
        if (!promotedUid) {
            promotedUid = waitlist[0];
        }

        if (promotedUid) {
            console.log(`Promoting ${promotedUid} from waitlist for slot ${slotKey}`);

            try {
                // Use a transaction to ensure atomic update
                await db.runTransaction(async (t) => {
                    const slotRef = db.collection('slots').doc(date);
                    const slotDoc = await t.get(slotRef);

                    if (!slotDoc.exists) throw "Slot document does not exist!";
                    
                    const newSlotsData = slotDoc.data();
                    const currentMain = newSlotsData[slotKey].main || [];
                    const currentWaitlist = newSlotsData[slotKey].waitlist || [];

                    // Ensure the slot still has a vacancy AND the user is still on the waitlist
                    if (currentMain.length < MAX_MAIN_SPOTS && currentWaitlist.includes(promotedUid)) {
                        
                        // Move from waitlist to main
                        newSlotsData[slotKey].waitlist = currentWaitlist.filter(uid => uid !== promotedUid);
                        newSlotsData[slotKey].main.push(promotedUid);
                        
                        // Update the document
                        t.update(slotRef, newSlotsData);

                        // Also update the 'bookings' collection (for tracking hours)
                        const bookingDocRef = db.collection('bookings').doc(slotKey);
                        t.set(bookingDocRef, {
                            date: date,
                            time: time,
                            players: newSlotsData[slotKey].main,
                            waitlist: newSlotsData[slotKey].waitlist
                        }, { merge: true });
                    }
                });
                console.log(`Successfully promoted ${promotedUid} to main list.`);
                // Note: The UI will update via the onSnapshot listener.
                
            } catch (e) {
                console.error("Waitlist promotion transaction failed: ", e);
            }
        }
    }
}


/** Core booking handler (book, waitlist, cancel) */
async function handleBookingAction(event) {
    if (!event.target.classList.contains('booking-btn')) return;

    const btn = event.target;
    const { key: slotKey, action } = btn.dataset;
    const [date, time] = slotKey.split('-');
    const uid = currentUser.uid;

    if (!uid) return displayMessage('You must be logged in to perform this action.', true);

    btn.disabled = true;

    try {
        await db.runTransaction(async (t) => {
            const slotRef = db.collection('slots').doc(date);
            const slotDoc = await t.get(slotRef);

            if (!slotDoc.exists) {
                if (action !== 'book' && action !== 'waitlist') throw "Slot is no longer available/does not exist.";
            }

            // Initialize or get current slot data
            const slotsData = slotDoc.data() || {};
            const slotData = slotsData[slotKey] || { main: [], waitlist: [] };
            let mainList = slotData.main || [];
            let waitlist = slotData.waitlist || [];
            
            // Fetch hours used
            const hoursUsed = await getWeeklyHoursUsed(uid);
            const isLimitReached = hoursUsed >= MAX_WEEKLY_HOURS;


            if (action === 'book' || action === 'waitlist') {
                // Pre-check for duplicate booking
                if (mainList.includes(uid) || waitlist.includes(uid)) {
                    throw "You are already booked or on the waitlist for this slot.";
                }

                // Check for 2 hour limit on current bookings
                if (isLimitReached) {
                    // Always direct to waitlist if limit is reached
                    waitlist.push(uid);
                    displayMessage('Limit reached (2 hours/week). You have been added to the Waitlist.', false);
                } else if (mainList.length < MAX_MAIN_SPOTS) {
                    // Add to main list if space available and limit not reached
                    mainList.push(uid);
                    displayMessage('Slot successfully booked!', false);
                } else {
                    // Add to waitlist if full
                    waitlist.push(uid);
                    displayMessage('Main list is full. You have been added to the Waitlist.', false);
                }

            } else if (action === 'cancel') {
                if (!mainList.includes(uid)) throw "You are not in the main list for this slot.";
                mainList = mainList.filter(p => p !== uid);
                displayMessage('Booking successfully cancelled.', false);

            } else if (action === 'cancel_waitlist') {
                if (!waitlist.includes(uid)) throw "You are not on the waitlist for this slot.";
                waitlist = waitlist.filter(p => p !== uid);
                displayMessage('Waitlist spot successfully cancelled.', false);
            }
            
            // --- Update Firestore ---
            slotsData[slotKey] = { main: mainList, waitlist: waitlist };
            
            // Update the 'slots' document
            t.set(slotRef, slotsData, { merge: true });

            // Update the 'bookings' document (for weekly tracking)
            const bookingDocRef = db.collection('bookings').doc(slotKey);
            t.set(bookingDocRef, {
                date: date,
                time: time,
                players: mainList,
                waitlist: waitlist // Keep waitlist data here too for easier tracking/promotion
            }, { merge: true });
        });

    } catch (error) {
        console.error("Booking transaction failed:", error);
        displayMessage(`Error: ${error.message || error}`, true);
    } finally {
        btn.disabled = false;
    }
}


// --- Initialization and Auth ---

async function initApp() {
    document.getElementById('loading').classList.remove('hidden');

    try {
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        
        // Ensure Date Picker is set to today by default
        const today = formatDate(new Date());
        const dateInput = document.getElementById('date-select');
        dateInput.value = today;
        dateInput.min = today; // Prevent booking in the past
        document.getElementById('current-date').textContent = today;

        // Auth State Listener
        auth.onAuthStateChanged(user => {
            document.getElementById('loading').classList.add('hidden');
            if (user) {
                // Logged in
                currentUser = user;
                document.getElementById('auth-container').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');
                document.getElementById('user-info').textContent = `Welcome, ${user.displayName || user.email}`;
                
                // Set up listeners for the default date
                setupBookingListener(dateInput.value);

            } else {
                // Logged out
                currentUser = null;
                document.getElementById('auth-container').classList.remove('hidden');
                document.getElementById('app-container').classList.add('hidden');
            }
        });
        
        // Event Listeners
        document.getElementById('google-login-btn').addEventListener('click', () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(provider).catch(e => displayMessage('Login Failed: ' + e.message, true));
        });
        
        document.getElementById('logout-btn').addEventListener('click', () => auth.signOut());
        
        document.getElementById('date-select').addEventListener('change', (e) => {
            // Re-render and re-subscribe to new date
            document.getElementById('current-date').textContent = e.target.value;
            setupBookingListener(e.target.value);
        });

        document.getElementById('slots-container').addEventListener('click', handleBookingAction);


    } catch (e) {
        console.error("Initialization Error:", e);
        document.getElementById('loading').textContent = 'Error initializing application. Check console for details.';
    }
}

document.addEventListener('DOMContentLoaded', initApp);