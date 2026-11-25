import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/** The signed-in user as GET /api/me returns it. The session itself lives in the `rapids_sid` cookie. */
export type MeUser = {
  id: number;
  username?: string;
  displayName: string;
  role: string;
  mustChangePassword?: boolean;
  [k: string]: unknown;
};

interface AuthState {
  csrfToken: string;
  user: MeUser | null;
}

const initialState: AuthState = { csrfToken: "", user: null };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession: (state, { payload }: PayloadAction<{ csrfToken?: string; user?: MeUser | null }>) => {
      if (payload.csrfToken !== undefined) state.csrfToken = payload.csrfToken;
      if (payload.user !== undefined) state.user = payload.user;
    },
    clearSession: (state) => {
      state.csrfToken = "";
      state.user = null;
    },
  },
});

export const { setSession, clearSession } = authSlice.actions;
export default authSlice.reducer;
