import React from "react";
import { getCurrentSchedule, DAYS, TIMES } from "./scheduleUtils";

export default function AdminTab() {
  const schedule = getCurrentSchedule();

  return (
    <div>
      <div className="mb-4 text-lg font-semibold">Confirmed & Waitlisted Players by Slot</div>
      <div className="overflow-x-auto">
        <table className="w-full border text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1">Day</th>
              <th className="border px-2 py-1">Time</th>
              <th className="border px-2 py-1">Confirmed Players</th>
              <th className="border px-2 py-1">Waitlist</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day =>
              TIMES.map(t =>
                <tr key={day + t.label}>
                  <td className="border px-2 py-1">{day}</td>
                  <td className="border px-2 py-1">{t.label}</td>
                  <td className="border px-2 py-1">
                    <ul>
                      {schedule[day][t.label].confirmed.map(u =>
                        <li key={u.name}>{u.name} <span className="text-xs text-gray-500">({u.email})</span></li>
                      )}
                    </ul>
                  </td>
                  <td className="border px-2 py-1">
                    <ul>
                      {schedule[day][t.label].waitlist.map(u =>
                        <li key={u.name}>{u.name} <span className="text-xs text-gray-500">({u.email})</span></li>
                      )}
                    </ul>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}