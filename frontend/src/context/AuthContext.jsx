import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthCtx = createContext(null);

const ROLE_TIER = { staff: 1, senior: 2, manager: 3, admin: 4 };
const tierOf = (role) => ROLE_TIER[role] || 0;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const refreshPermissions = async () => {
    try {
      const r = await api.get("/auth/permissions");
      setPermissions(new Set(r.data?.grants || []));
    } catch {
      setPermissions(new Set());
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("cc_token");
    const cached = localStorage.getItem("cc_user");
    if (cached) setUser(JSON.parse(cached));
    if (token) {
      api
        .get("/auth/me")
        .then(async (r) => {
          setUser(r.data);
          localStorage.setItem("cc_user", JSON.stringify(r.data));
          await refreshPermissions();
        })
        .catch(() => {
          localStorage.removeItem("cc_token");
          localStorage.removeItem("cc_user");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("cc_token", data.token);
    localStorage.setItem("cc_user", JSON.stringify(data.user));
    setUser(data.user);
    await refreshPermissions();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    setUser(null);
    setPermissions(new Set());
  };

  const can = (perm) => permissions.has(perm);
  const tier = tierOf(user?.role);
  const isSeniorOrAbove = tier >= 2;
  const isManagerOrAbove = tier >= 3;

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        can,
        tier,
        isSeniorOrAbove,
        isManagerOrAbove,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
