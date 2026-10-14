import { configureStore, createListenerMiddleware } from "@reduxjs/toolkit";
import authReducer from "@/modules/auth/store/slices/authSlice";
import { baseApi } from "@/lib/api/baseApi";

export function createAppStore() {
  const listener = createListenerMiddleware();
  const store = configureStore({
    reducer: { auth: authReducer, [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) =>
      getDefault().prepend(listener.middleware).concat(baseApi.middleware),
  });
  listener.startListening({
    predicate: (_action, current, previous) => {
      const next = (current as RootState).auth.user;
      const old = (previous as RootState).auth.user;
      return next?.id !== old?.id || next?.role !== old?.role;
    },
    effect: (_action, api) => {
      api.dispatch(baseApi.util.resetApiState());
    },
  });
  return store;
}
export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
