import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      session: null,
      user: null,
      identities: [],
      linkedProviders: new Set(),
      currentProvider: "",
      loading: false,
      authError: null,
      refreshAuthState: async () => {},
    };
  }
  return context;
}
