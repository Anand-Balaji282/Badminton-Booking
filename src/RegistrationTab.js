import React, { useState } from "react";
import {
  DAYS, TIMES, getCurrentSchedule, registerUser,
  getUserAllRegistrations, EMAIL_DOMAIN, removeUser, getUserWeeklyHours
} from "./scheduleUtils";

export default function RegistrationTab({ onUpdate }) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState({ day: DAYS[0], timeLabel: TIMES[0].label });

  const schedule = getCurrentSchedule();

  function handleRegister(e) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    // Check if user already registered for this slot
    const existing = getUserAllRegistrations(schedule, name).find(
      r => r.day === selected.day && r.timeLabel === selected.timeLabel
    );
    if (existing) {
      setMessage("You are already registered for this slot.");
      return;
    }
    const res = registerUser({ name: name.trim(), ...selected });
    setMessage(
      res.status === "confirmed"
        ? `Registered for ${selected.day} ${selected.timeLabel} as confirmed!`
        : res.reason
    );
    onUpdate?.();
  }

  function handleRemove() {
    if (!name.trim()) {
      setMessage("Please enter your name.");
      return;
    }
    const removed = removeUser(name.trim());
    setMessage(removed ? "All your registrations have been removed." : "No registrations found.");
    onUpdate?.();
  }

  const weeklyHours = name.trim() ? getUserWeeklyHours(schedule, name.trim()) : 0;
  const userRegs = name.trim() ? getUserAllRegistrations(schedule, name.trim()) : [];

  return (
    <div>
      <form className="mb-4 flex flex-col md:flex-row md:items-end gap-4" onSubmit={handleRegister}>
        <div>
          <label className="block font-medium">Name:</label>
          <input
            className="border px-2 py-1 rounded w-40"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
          />
          <div className="text-xs text-gray-500 mt-1">Email: {name ? `${name}@${EMAIL_DOMAIN}` : ""}</div>
        </div>
        <div>
          <label className="block font-medium">Day:</label>
          <select
            className="border px-2 py-1 rounded w-32"
            value={selected.day}
            onChange={e => setSelected(s => ({ ...s, day: e.target.value }))}
          >
            {DAYS.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-medium">Time:</label>
          <select
            className="border px-2 py-1 rounded w-32"
            value={selected.timeLabel}
            onChange={e => setSelected(s => ({ ...s, timeLabel: e.target.value }))}
          >
            {TIMES.map(t => (
              <option key={t.label} value={t.label}>{t.label}</option>
            ))}
          </select>
        </div>
        <button className="bg-blue-600 text-white px-4 py-2 rounded font-semibold" type="submit">
          Register
        </button>
        <button
          type="button"
          className="ml-2 bg-red-100 text-red-600 px-4 py-2 rounded font-semibold"
          onClick={handleRemove}
        >
          Remove Me
        </button>
      </form>
      {message && <div className="mb-2 text-blue-700">{message}</div>}
      {name && (
        <div className="bg-gray-50 border p-3 rounded mb-4">
          <div className="font-semibold mb-1">Your Registrations:</div>
          <div>Total confirmed hours this week: <b>{weeklyHours}</b></div>
          <ul className="list-disc ml-5 mt-1">
            {userRegs.length === 0
              ? <li>No registrations yet.</li>
              : userRegs.map(r => (
                  <li key={r.day + r.timeLabel}>
                    {r.day} {r.timeLabel} - <span className={r.status === "confirmed" ? "text-green-600" : "text-yellow-600"}>{r.status}</span>
                  </li>
                ))}
          </ul>
        </div>
      )}
    </div>
  );
}