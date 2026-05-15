import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const OrgCtx = createContext(null);

const DEFAULT_SETTINGS = {
  service_modes: ["children", "adult"],
  primary_mode: null,
  settings_initialized: false,
  org_display_name: null,
};

const SESSION_KEY = "cc_session_mode";

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(() => {
    try {
      const c = localStorage.getItem("cc_org_settings");
      return c ? JSON.parse(c) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });
  const [sessionMode, setSessionModeState] = useState(() => localStorage.getItem(SESSION_KEY));
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await api.get("/org/settings");
      setSettings(r.data);
      localStorage.setItem("cc_org_settings", JSON.stringify(r.data));
    } catch { /* keep cached */ }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (user) refresh();
    if (!user) setSettings(DEFAULT_SETTINGS);
  }, [user, refresh]);

  const update = useCallback(async (patch) => {
    const r = await api.patch("/org/settings", patch);
    setSettings(r.data);
    localStorage.setItem("cc_org_settings", JSON.stringify(r.data));
    return r.data;
  }, []);

  const setSessionMode = useCallback((mode) => {
    if (mode) localStorage.setItem(SESSION_KEY, mode);
    else localStorage.removeItem(SESSION_KEY);
    setSessionModeState(mode);
  }, []);

  const clearSessionMode = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSessionModeState(null);
  }, []);

  const orgModes = settings.service_modes || ["children", "adult"];
  const isOrgDual = orgModes.length === 2;
  // The "effective mode" — the single sector the user is operating in this session.
  // If the org is single-sector, that mode is forced regardless of session storage.
  const effectiveMode = orgModes.length === 1 ? orgModes[0] : (sessionMode || null);

  return (
    <OrgCtx.Provider
      value={{
        settings,
        refresh,
        update,
        loading,
        // Org-level
        orgModes,
        isOrgDual,
        isOrgChildrenOnly: orgModes.length === 1 && orgModes[0] === "children",
        isOrgAdultOnly: orgModes.length === 1 && orgModes[0] === "adult",
        // Session-level (the actual sector the user is in right now)
        sessionMode,
        setSessionMode,
        clearSessionMode,
        effectiveMode,
        isChildrenMode: effectiveMode === "children",
        isAdultMode: effectiveMode === "adult",
        needsSessionMode: !effectiveMode,  // user must pick a sector before entering
      }}
    >
      {children}
    </OrgCtx.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgCtx);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
