import { useState, useEffect } from 'react';

/**
 * Manages Pomodoro timer state, tick, and socket sync.
 * The parent socket init effect should call handleTimerMessage() for
 * incoming TIMER_START / TIMER_STOP socket events.
 */
export const usePomodoro = (id, socketRef) => {
    const [timerTime, setTimerTime]             = useState(0);
    const [timerActive, setTimerActive]         = useState(false);
    const [timerMode, setTimerMode]             = useState('focus');
    const [sessionDuration, setSessionDuration] = useState(25);

    // Tick — flips between focus and break when it hits zero
    useEffect(() => {
        if (!timerActive) return;
        if (timerTime > 0) {
            const interval = setInterval(() => setTimerTime(prev => prev - 1), 1000);
            return () => clearInterval(interval);
        }
        if (timerMode === 'focus') {
            setTimerMode('break');
            setTimerTime(5 * 60);
        } else {
            setTimerMode('focus');
            setTimerTime(sessionDuration * 60);
        }
    }, [timerActive, timerTime, timerMode, sessionDuration]);

    const startTimer = () => {
        setTimerTime(sessionDuration * 60);
        setTimerActive(true);
        setTimerMode('focus');
        socketRef.current?.emit('send_message', {
            room: id, type: 'TIMER_START', duration: sessionDuration,
        });
    };

    const stopTimer = () => {
        setTimerActive(false);
        setTimerTime(0);
        setTimerMode('focus');
        socketRef.current?.emit('send_message', { room: id, type: 'TIMER_STOP' });
    };

    /** Call this from the socket receive_message handler for timer-type messages. */
    const handleTimerMessage = (data) => {
        if (data.type === 'TIMER_START') {
            setSessionDuration(data.duration);
            setTimerTime(data.duration * 60);
            setTimerMode('focus');
            setTimerActive(true);
        } else if (data.type === 'TIMER_STOP') {
            setTimerActive(false);
            setTimerTime(0);
            setTimerMode('focus');
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    return {
        timerTime, timerActive, timerMode,
        sessionDuration, setSessionDuration,
        startTimer, stopTimer, formatTime, handleTimerMessage,
    };
};
