import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

/**
 * Handles XP saving, session recaps, and the exit modal.
 * Registers a beforeunload handler so XP is captured on tab close via sendBeacon.
 * Call saveStudyTime(userList) to trigger the modal path (e.g. on Leave button).
 */
export const useSessionSave = (id, userId, joinTime, goalCompleted) => {
    const navigate = useNavigate();
    const xpSavedRef = useRef(false);

    const [showExitModal, setShowExitModal] = useState(false);
    const [sessionStats, setSessionStats]   = useState({
        minutes: 0, xpGained: 0, leveledUp: false,
        newLevel: 0, currentStreak: 0, longestStreak: 0,
    });
    const [recap, setRecap]           = useState(null);
    const [recapLoading, setRecapLoading] = useState(false);

    const buildPayload = () => {
        const minutes = Math.floor((Date.now() - joinTime) / 60000);
        if (minutes <= 0) return null;
        return {
            xpGained: minutes * 10 + (goalCompleted ? 25 : 0),
            groupId: id,
            startedAt: new Date(joinTime).toISOString(),
            durationMinutes: minutes,
            clientDate: new Date().toLocaleDateString('en-CA'),
        };
    };

    // sendBeacon on tab close / navigation away
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (xpSavedRef.current || !joinTime || !userId) return;
            const payload = buildPayload();
            if (!payload) return;
            const raw = localStorage.getItem('userData');
            const token = raw ? JSON.parse(raw).token : null;
            if (!token) return;
            // Security note: sendBeacon sends the short-lived access token (15 min TTL)
            // in the request body because the Beacon API does not support custom headers.
            // This is an acceptable tradeoff — the access token is already short-lived and
            // is NOT the 30-day refresh token (which is now httpOnly cookie-only).
            const blob = new Blob(
                [JSON.stringify({ ...payload, accessToken: token })],
                { type: 'application/json' }
            );
            navigator.sendBeacon(`${process.env.REACT_APP_API_URL}/users/updateXP/${userId}`, blob);
            xpSavedRef.current = true;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Also fire on React-router navigation (useEffect cleanup)
            if (!xpSavedRef.current && joinTime && userId) {
                const payload = buildPayload();
                if (payload) {
                    const raw = localStorage.getItem('userData');
                    const token = raw ? JSON.parse(raw).token : null;
                    if (token) {
                        const blob = new Blob(
                            [JSON.stringify({ ...payload, accessToken: token })],
                            { type: 'application/json' }
                        );
                        navigator.sendBeacon(`${process.env.REACT_APP_API_URL}/users/updateXP/${userId}`, blob);
                    }
                    xpSavedRef.current = true;
                }
            }
        };
    }, [joinTime, userId, id]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Save study time via the API.
     * @param {Array} userList - current room participants, for recap generation
     * @param {boolean} showModal - whether to open the exit modal
     */
    const saveStudyTime = async (userList, showModal = true) => {
        if (xpSavedRef.current || !joinTime || !userId) return false;
        const minutes = Math.floor((Date.now() - joinTime) / 60000);
        const xpGained = minutes * 10 + (goalCompleted ? 25 : 0);
        if (minutes <= 0) return false;

        xpSavedRef.current = true;
        const sessionStart = new Date(joinTime).toISOString();
        const sessionEnd   = new Date().toISOString();

        try {
            const response = await api.put(`/users/updateXP/${userId}`, {
                xpGained, groupId: id,
                startedAt: sessionStart,
                durationMinutes: minutes,
                clientDate: new Date().toLocaleDateString('en-CA'),
            });

            if (showModal) {
                setSessionStats({
                    minutes, xpGained,
                    leveledUp: response.data.leveledUp,
                    newLevel: response.data.newLevel,
                    currentStreak: response.data.currentStreak,
                    longestStreak: response.data.longestStreak,
                });
                setShowExitModal(true);

                // Generate recap in the background — don't block the modal
                setRecapLoading(true);
                setRecap(null);
                const participantIds = [
                    userId,
                    ...userList.map(u => u.userId).filter(uid => uid && uid !== userId),
                ];
                api.post('/recaps/generate', {
                    groupId: id, startedAt: sessionStart, endedAt: sessionEnd,
                    durationMinutes: minutes, participantIds,
                })
                    .then(res => setRecap(res.data.recap))
                    .catch(err => console.error('Recap generation failed:', err))
                    .finally(() => setRecapLoading(false));
            }
            return true;
        } catch (error) {
            console.error('Error updating XP:', error);
            xpSavedRef.current = false;
            return false;
        }
    };

    const closeExitModal = () => {
        const hadRecap = !!recap;
        setShowExitModal(false);
        setRecap(null);
        setRecapLoading(false);
        navigate(hadRecap ? '/dashboard?tab=recaps' : '/lobby');
    };

    return {
        showExitModal, setShowExitModal,
        sessionStats, recap, recapLoading,
        saveStudyTime, closeExitModal,
    };
};
