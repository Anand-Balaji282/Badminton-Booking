// Constants
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const TIMES = [
  { label: "6pm–7pm", hour: 18 },
  { label: "7pm–8pm", hour: 19 },
];
const STORAGE_KEY = "badminton_schedule_v1";
const EMAIL_DOMAIN = "nvidia.com";
const MAX_PER_SLOT = 4;
const MAX_WEEKLY_HOURS = 2;

// Each slot: { confirmed: [{name, email}], waitlist: [{name, email}], time: ISO }
function getScheduleTemplate() {
  const template = {};
  for (const day of DAYS) {
    template[day] = {};
    for (const t of TIMES) {
      // Time is set to next weekday at hour:00
      template[day][t.label] = {
        confirmed: [],
        waitlist: [],
        time: getNextWeekdayTime(day, t.hour)
      };
    }
  }
  return template;
}

function getNextWeekdayTime(day, hour) {
  // Returns next occurrence of weekday at hour:00
  const dayMap = {
    Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5
  };
  const now = new Date();
  const result = new Date(now);
  const currentDow = now.getDay();
  let targetDow = dayMap[day];
  let addDays = (targetDow - currentDow + 7) % 7;
  if (addDays === 0 && now.getHours() >= hour) addDays = 7; // Next week if past slot
  result.setDate(now.getDate() + addDays);
  result.setHours(hour, 0, 0, 0);
  return result.toISOString();
}

// Initialize schedule in localStorage if missing
export function initializeSchedule() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getScheduleTemplate()));
  }
}
export function getCurrentSchedule() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : getScheduleTemplate();
}
export function saveSchedule(schedule) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
}

// Get all slots as [{ day, timeLabel, slot }]
export function getAllSlots(schedule) {
  const res = [];
  for (const day of DAYS) {
    for (const t of TIMES) {
      res.push({
        day,
        timeLabel: t.label,
        slot: schedule[day][t.label],
      });
    }
  }
  return res;
}

// Count total registrations for user this week (confirmed only)
export function getUserWeeklyHours(schedule, username) {
  let count = 0;
  for (const { slot } of getAllSlots(schedule)) {
    if (slot.confirmed.some(u => u.name === username)) count++;
  }
  return count;
}

// Find if user is already in any slot (confirmed or waitlist), return [{day, timeLabel, status}]
export function getUserAllRegistrations(schedule, username) {
  const res = [];
  for (const { day, timeLabel, slot } of getAllSlots(schedule)) {
    if (slot.confirmed.some(u => u.name === username)) {
      res.push({ day, timeLabel, status: "confirmed" });
    }
    if (slot.waitlist.some(u => u.name === username)) {
      res.push({ day, timeLabel, status: "waitlist" });
    }
  }
  return res;
}

// Register user for a slot
export function registerUser({ name, day, timeLabel }) {
  const schedule = getCurrentSchedule();
  const email = `${name}@${EMAIL_DOMAIN}`;
  const slot = schedule[day][timeLabel];

  // Check if user is already registered in this slot
  const alreadyConfirmed = slot.confirmed.some(u => u.name === name);
  const alreadyWaitlist = slot.waitlist.some(u => u.name === name);
  if (alreadyConfirmed || alreadyWaitlist) {
    return {
      status: alreadyConfirmed ? "confirmed" : "waitlist",
      reason: "You are already registered for this slot.",
    };
  }

  // Check weekly hours (confirmed registrations only)
  const hours = getUserWeeklyHours(schedule, name);
  let status, reason;
  if (hours >= MAX_WEEKLY_HOURS) {
    // Must be waitlisted, even if space
    slot.waitlist.push({ name, email });
    status = "waitlist";
    reason = "You have reached the weekly 2-hour limit. You have been added to the waitlist.";
  } else if (slot.confirmed.length < MAX_PER_SLOT) {
    slot.confirmed.push({ name, email });
    status = "confirmed";
  } else {
    slot.waitlist.push({ name, email });
    status = "waitlist";
    reason = "Slot is full. You have been added to the waitlist.";
  }
  saveSchedule(schedule);
  return { status, reason };
}

// Remove user from all slots
export function removeUser({ name, day, timeLabel }) {
  const schedule = getCurrentSchedule();
  const slot = schedule[day][timeLabel];

  // Remove from confirmed
  const beforeConfirmed = slot.confirmed.length;
  slot.confirmed = slot.confirmed.filter(u => u.name !== name);

  // Remove from waitlist
  const beforeWaitlist = slot.waitlist.length;
  slot.waitlist = slot.waitlist.filter(u => u.name !== name);

  // Only save if a removal happened
  if (slot.confirmed.length < beforeConfirmed || slot.waitlist.length < beforeWaitlist) {
    saveSchedule(schedule);
    return { status: "removed", message: "You have been removed from the selected slot." };
  } else {
    return { status: "not found", message: "You were not registered in this slot." };
  }
}

// Promote waitlisted users 2 hours before slot, even if over 2-hour limit
export function promoteWaitlistedUsers() {
  const schedule = getCurrentSchedule();
  const now = new Date();
  let changed = false;
  for (const { day, timeLabel, slot } of getAllSlots(schedule)) {
    const slotTime = new Date(slot.time);
    // If slot is within 2 hours and confirmed < MAX
    if (slotTime > now && slotTime - now <= 2 * 60 * 60 * 1000) {
      while (slot.confirmed.length < MAX_PER_SLOT && slot.waitlist.length > 0) {
        const user = slot.waitlist.shift();
        slot.confirmed.push(user);
        simulateEmail(user.email, day, timeLabel);
        changed = true;
      }
    }
  }
  if (changed) saveSchedule(schedule);
}

// Simulate sending email
function simulateEmail(email, day, timeLabel) {
  // eslint-disable-next-line no-console
  console.log(`Simulated email sent to ${email}: "You have been promoted to the main list for ${day} ${timeLabel}."`);
}

// Export helpers
export { EMAIL_DOMAIN, MAX_PER_SLOT, MAX_WEEKLY_HOURS };
