import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  withCredentials: true,
  timeout: 10000
});

// Log requests
api.interceptors.request.use((config) => {
  console.log("====== API REQUEST DEBUG START ======");
  const authHeader = config.headers.get?.("Authorization") || config.headers["Authorization"];
  const allHeaders = config.headers.common || config.headers;
  
  console.log("[API] Request:", config.method?.toUpperCase(), config.url);
  console.log("[API] Authorization header present:", !!authHeader);
  console.log("[API] Common headers:", allHeaders);
  
  if (authHeader) {
    console.log("[API] ✓ Auth header value:", String(authHeader).substring(0, 70) + "...");
  } else {
    console.log("[API] ✗ NO Authorization header found!");
    console.log("[API] All headers:", config.headers);
  }
  console.log("====== API REQUEST DEBUG END ======");
  return config;
});

// Log errors
api.interceptors.response.use(
  (response) => {
    console.log("[API] Response:", response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error("[API] Error Code:", error.code);
    console.error("[API] Error Message:", error.message);
    console.error("[API] Response Status:", error.response?.status);
    console.error("[API] Response Data:", error.response?.data);
    console.error("[API] Full Error:", error);
    if (error.code === "ERR_NETWORK") {
      console.error("[API] NETWORK ERROR - Backend might not be running at", api.defaults.baseURL);
    }
    return Promise.reject(error);
  }
);

// Helper to add auth token
export function setAuthToken(token: string | undefined) {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    console.log("[API] ✓ Authorization header set, token preview:", token.substring(0, 50) + "...");
  } else {
    delete api.defaults.headers.common["Authorization"];
    console.log("[API] Authorization header cleared");
  }
}



