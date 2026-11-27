import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQuery } from "@/store/apiBaseQuery";
import { setSession, type MeUser } from "@/store/authSlice";

export type SiteView = {
  logo?: string;
  logoDark?: string;
  supportEmail?: string;
  supportPhone?: string;
  links?: Record<string, string>;
};

export type MeReply = { user: MeUser; csrfToken: string; [k: string]: unknown };
type AuthOptions = { google: boolean; linkedin?: boolean; signup: boolean };
type LoginReply = { ok?: boolean; codeRequired?: boolean; challenge?: string; sentTo?: string };

/** One API slice for the whole app; each screen adds its endpoints here as it is ported. */
export const connectApi = createApi({
  reducerPath: "connectApi",
  baseQuery,
  tagTypes: ["Me"],
  endpoints: (builder) => ({
    // ── public pages ──
    getSite: builder.query<SiteView, void>({ query: () => "/site" }),
    getAuthOptions: builder.query<AuthOptions, void>({ query: () => "/auth/options" }),

    // ── sign-in (errors shown inline, never redirect on 401) ──
    login: builder.mutation<LoginReply, { username: string; password: string }>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
      extraOptions: { noRedirect: true },
    }),
    loginCode: builder.mutation<{ ok?: boolean }, { challenge: string; code: string }>({
      query: (body) => ({ url: "/auth/login-code", method: "POST", body }),
      extraOptions: { noRedirect: true },
    }),
    resendLoginCode: builder.mutation<{ ok?: boolean }, { challenge: string; email: string }>({
      query: (body) => ({ url: "/auth/login-code/resend", method: "POST", body }),
      extraOptions: { noRedirect: true },
    }),
    resendVerification: builder.mutation<{ ok?: boolean }, { email: string }>({
      query: (body) => ({ url: "/signup/resend", method: "POST", body }),
      extraOptions: { noRedirect: true },
    }),

    // ── session ──
    getMe: builder.query<MeReply, void>({
      query: () => "/me",
      providesTags: ["Me"],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(setSession({ csrfToken: data.csrfToken, user: data.user }));
        } catch {
          /* 401 is handled by the base query */
        }
      },
    }),
    logout: builder.mutation<{ ok?: boolean }, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
    }),

    // ── the ported inbox screens (src/legacy): one request, any route, raw answer + status ──
    request: builder.mutation<
      { status: number; raw: string },
      { url: string; method: string; headers: Record<string, string>; body?: BodyInit }
    >({
      query: ({ url, method, headers, body }) => ({
        url,
        method,
        headers,
        body,
        responseHandler: "text",
        validateStatus: () => true,
      }),
      transformResponse: (raw: string, meta) => ({ status: meta?.response?.status ?? 0, raw: raw ?? "" }),
    }),
  }),
});

export const {
  useGetSiteQuery,
  useGetAuthOptionsQuery,
  useLoginMutation,
  useLoginCodeMutation,
  useResendLoginCodeMutation,
  useResendVerificationMutation,
  useGetMeQuery,
  useLogoutMutation,
} = connectApi;
