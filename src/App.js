import React, { useEffect, useState } from "react";
import RegistrationTab from "./RegistrationTab";
import AdminTab from "./AdminTab";
import { initializeSchedule, getCurrentSchedule, saveSchedule, promoteWaitlistedUsers } from "./scheduleUtils";

const TABS = [
  { key: "register", label: "Registration" },
  { key: "admin", label: "Admin Monitoring" }
];

// Check and promote waitlisted users on load and every minute
function useAutoPromote() {
  const [flag, setFlag] = useState(0);
  useEffect(() => {
    // Promote on mount
    promoteWaitlistedUsers();
    // Promote every minute in case user keeps app open
    const interval = setInterval(() => {
      promoteWaitlistedUsers();
      setFlag(f => f + 1); // trigger re-render
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  return flag;
}

export default function App() {
  const [tab, setTab] = useState("register");
  // Trigger re-renders when promotions happen
  useAutoPromote();

  // Ensure schedule is initialized
  useEffect(() => {
    initializeSchedule();
  }, []);

  // Just for demo: force reload on localStorage changes (in case of multiple tabs)
  const [version, setVersion] = useState(Date.now());
  useEffect(() => {
    const fn = () => setVersion(Date.now());
    window.addEventListener("storage", fn);
    return () => window.removeEventListener("storage", fn);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-3xl mx-auto bg-white rounded shadow p-6">
        <h1 className="text-2xl font-bold mb-4 text-center">Badminton Weekly Registration</h1>
        <div className="flex border-b mb-6">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`flex-1 p-2 text-lg font-semibold border-b-2 ${
                tab === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "register" ? (
          <RegistrationTab onUpdate={() => setVersion(Date.now())} />
        ) : (
          <AdminTab />
        )}
      </div>
    </div>
  );
}