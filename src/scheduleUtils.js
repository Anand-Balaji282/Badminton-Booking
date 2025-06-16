export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

export const TIMES = [
  "6:00 AM - 7:00 AM",
  "7:00 AM - 8:00 AM",
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "4:00 PM - 5:00 PM",
  "5:00 PM - 6:00 PM",
  "6:00 PM - 7:00 PM",
  "7:00 PM - 8:00 PM"
];
export function getCurrentSchedule() {
  const s = localStorage.getItem("schedule");
  return s ? JSON.parse(s) : {};
}

export function saveSchedule(schedule) {
  localStorage.setItem("schedule", JSON.stringify(schedule));
}

const EMAIL_DOMAIN = "example.com";
const MAX_PER_SLOT = 8;
const MAX_WEEKLY_HOURS = 2;

// Helper: Get all slots
export function getAllSlots(schedule) {
  const slots = [];
  Object.keys(schedule).forEach(day => {
    Object.keys(schedule[day]).forEach(timeLabel => {
      slots.push({ day, timeLabel, slot: schedule[day][timeLabel] });
    });
  });
  return slots;
}

// Helper: Get user's confirmed registration count for the week
export function getUserWeeklyHours(schedule, name) {
  let count = 0;
  for (const { slot } of getAllSlots(schedule)) {
    if (slot.confirmed.some(u => u.name === name)) {
      count += 1;
    }
  }
  return count;
}

// Register user for a slot (does not remove from other slots)
export function registerUser({ name, day, timeLabel }) {
  const schedule = getCurrentSchedule();
  const email = `${name}@${EMAIL_DOMAIN}`;
  const slot = schedule[day][timeLabel];

  // Already in this slot?
  if (
    slot.confirmed.some(u => u.name === name) ||
    slot.waitlist.some(u => u.name === name)
  ) {
    return {
      status: "already_registered",
      reason: "You are already registered for this slot.",
    };
  }

  // Count user's confirmed registrations
  const hours = getUserWeeklyHours(schedule, name);

  if (hours >= MAX_WEEKLY_HOURS) {
    slot.waitlist.push({ name, email });
    saveSchedule(schedule);
    return {
      status: "waitlist",
      reason:
        "You have reached the 2-hour weekly limit. You have been added to the waitlist for this slot.",
    };
  } else if (slot.confirmed.length < MAX_PER_SLOT) {
    slot.confirmed.push({ name, email });
    saveSchedule(schedule);
    return { status: "confirmed" };
  } else {
    slot.waitlist.push({ name, email });
    saveSchedule(schedule);
    return {
      status: "waitlist",
      reason: "Slot is full. You have been added to the waitlist.",
    };
  }
}

// Remove user from a single slot only
export function removeUser({ name, day, timeLabel }) {
  const schedule = getCurrentSchedule();
  const slot = schedule[day][timeLabel];

  const beforeConfirmed = slot.confirmed.length;
  const beforeWaitlist = slot.waitlist.length;

  slot.confirmed = slot.confirmed.filter(u => u.name !== name);
  slot.waitlist = slot.waitlist.filter(u => u.name !== name);

  if (
    slot.confirmed.length < beforeConfirmed ||
    slot.waitlist.length < beforeWaitlist
  ) {
    saveSchedule(schedule);
    return {
      status: "removed",
      message: "You have been removed from the selected slot.",
    };
  } else {
    return {
      status: "not_found",
      message: "You were not registered in this slot.",
    };
  }
}
