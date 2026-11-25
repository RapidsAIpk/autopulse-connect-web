import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";
import { connectApi } from "@/store/connectApi";
import authReducer from "@/store/authSlice";

const rootReducer = combineReducers({
  [connectApi.reducerPath]: connectApi.reducer,
  auth: authReducer,
});

// The session lives in the HttpOnly `rapids_sid` cookie and the CSRF token comes fresh from /api/me on every
// load, so nothing sensitive is persisted. UI preferences keep the old localStorage keys (autopulse.theme, …).
const persistConfig = { key: "autopulse-connect", storage, whitelist: [] as string[] };

export const store = configureStore({
  reducer: persistReducer(persistConfig, rootReducer),
  middleware: (getDefault) =>
    getDefault({ serializableCheck: { ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"] } }).concat(
      connectApi.middleware,
    ),
});

export const persistor = persistStore(store);
setupListeners(store.dispatch);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
