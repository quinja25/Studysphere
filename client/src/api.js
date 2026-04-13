import axios from 'axios';

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
});

// Attach the JWT access token to every request automatically
api.interceptors.request.use((config) => {
    const raw = localStorage.getItem('userData');
    if (raw) {
        const { token } = JSON.parse(raw);
        if (token) {
            config.headers['accessToken'] = token;
        }
    }
    return config;
});

// On 401, silently refresh the access token using the stored refresh token,
// then retry the original request. If refresh fails, force re-login.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const original = error.config;
        const is401 = error.response?.status === 401;
        const alreadyRetried = original._retry;
        const isRefreshCall = original.url?.includes('/users/refresh');

        if (is401 && !alreadyRetried && !isRefreshCall) {
            original._retry = true;
            try {
                const raw = localStorage.getItem('userData');
                if (!raw) return Promise.reject(error);
                const userData = JSON.parse(raw);
                if (!userData.refreshToken) return Promise.reject(error);

                // Use base axios (not `api`) to avoid triggering this interceptor again
                const { data } = await axios.post(
                    `${process.env.REACT_APP_API_URL}/users/refresh`,
                    { refreshToken: userData.refreshToken }
                );

                userData.token = data.accessToken;
                localStorage.setItem('userData', JSON.stringify(userData));
                original.headers['accessToken'] = data.accessToken;
                return api(original);
            } catch {
                localStorage.removeItem('userData');
                window.location.href = '/';
                return Promise.reject(error);
            }
        }
        return Promise.reject(error);
    }
);

export default api;
