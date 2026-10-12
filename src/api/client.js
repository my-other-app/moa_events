import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
});

const read = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

/** Drops the sign-in a registration left behind; every page here works without one. */
export const forgetSession = () => {
    try {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
    } catch {
        /* private mode */
    }
};

// Add a request interceptor to inject the token
apiClient.interceptors.request.use(
    (config) => {
        const token = read("access_token");
        if (token && !config.skipAuth) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// A registration stores the token it was handed, and tokens age out. Once one
// has, every public page was failing with a 401 it never needed: the event
// page, the agenda, the shelf. On a 401 the stale token is forgotten and the
// same request goes once more as a plain visitor.
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const config = error?.config;
        const sentToken = Boolean(config?.headers?.Authorization);
        if (error?.response?.status === 401 && sentToken && !config.skipAuth) {
            forgetSession();
            delete config.headers.Authorization;
            return apiClient.request({ ...config, skipAuth: true });
        }
        return Promise.reject(error);
    }
);

export default apiClient;
