import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      session: null,
      user: null,
      spotifyToken: null,
      loading: false,
    };
  }
  return context;
}
