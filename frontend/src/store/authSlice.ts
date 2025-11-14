import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface ExplicitContent {
  filter_enabled: boolean;
  filter_locked: boolean;
}

interface SpotifyUser {
  id: string;
  display_name: string;
  email: string;
  external_urls?: { spotify: string };
  followers?: { total: number };
  href?: string;
  images?: { url: string; height?: number; width?: number }[];
  product?: string;
  uri?: string;
  country?: string;
  explicit_content?: ExplicitContent;
}

interface AuthState {
  session: string | null;
  user: SpotifyUser | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  session: localStorage.getItem("spotify_session"),
  user: null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession: (state, action: PayloadAction<string>) => {
      state.session = action.payload;
      localStorage.setItem("spotify_session", action.payload);
    },
    setUser: (state, action: PayloadAction<SpotifyUser>) => {
      state.user = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    logout: (state) => {
      state.session = null;
      state.user = null;
      state.error = null;
      localStorage.removeItem("spotify_session");
    },
  },
});

export const { setSession, setUser, setLoading, setError, logout } =
  authSlice.actions;
export default authSlice.reducer;
