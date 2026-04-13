import React, { useContext, useEffect, useState, useRef } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { PlayButton } from '../components/PlayButton';
import { PauseButton } from '../components/PauseButton';
import { SettingButton } from '../components/SettingButton';
import SettingsContext from './SettingsContext';
import './Timer.css';


const red = '#c43a31';
const green = '#35c458';

export const Timer = () => {

    const SettingsInfo = useContext(SettingsContext);

    const [isPaused, setIsPaused] = useState(true);
    const [mode, setMode] = useState('study');
    const [secondsLeft, setSecondsLeft] = useState(SettingsInfo.studyMinuites * 60);

    const secondsLeftRef = useRef(secondsLeft);
    const isPausedRef = useRef(isPaused);
    const modeRef = useRef(mode);

    function showNotification(newMode) {
        alert(`Switched to ${newMode} mode`);
    }

    function switchMode() {
        const nextMode = modeRef.current === 'study' ? 'break' : 'study';
        const nextSeconds = (nextMode === 'study' ? SettingsInfo.studyMinuites : SettingsInfo.breakMinuites) * 60;

        setMode(nextMode);
        modeRef.current = nextMode;

        setSecondsLeft(nextSeconds);
        secondsLeftRef.current = nextSeconds;

        showNotification(nextMode);
    }

    function initTimer() {
        setSecondsLeft(SettingsInfo.studyMinuites * 60);
    }

    function tick() {
        secondsLeftRef.current--;
        setSecondsLeft(secondsLeftRef.current);
    }

    useEffect(() => {
        initTimer();

        const interval = setInterval(() => {
            if (isPausedRef.current) {
                return;
            }
            if (secondsLeftRef.current === 0) {
                return switchMode();
            }

            tick();
        }, 1000);

        return () => clearInterval(interval);
    }, [SettingsInfo]);

    const totalSeconds = mode === 'study' ? SettingsInfo.studyMinuites * 60 : SettingsInfo.breakMinuites * 60;
    const percentage = Math.round(secondsLeft / totalSeconds * 100);

    const minutes = Math.floor(secondsLeft / 60);
    let seconds = secondsLeft % 60;
    if (seconds < 10) seconds = '0' + seconds;

    return (
        <div className='timer-container'>
            <div className='timer-box'>
                <div style={{ width: 140, height: 140 }} className='timer-box'>
                    <CircularProgressbar className='circular-bar' value={percentage} text={minutes + ":" + seconds} styles={buildStyles({
                        // Text style
                        textColor: 'black',
                        text: {
                            // Smaller font size
                            fontSize: '15px', // Adjust this value as needed
                        },

                        // Progress path (circle) style
                        pathColor: mode === 'study' ? red : green,

                        // Background path (trail) style - acts as a border
                        trailWidth: 3, // Adjust the width of the border

                        // Tail color
                        tailColor: 'rgba(255,255,255,.2)',
                    })} />
                </div>



            </div>
            <div className='timer-buttons'>
                {isPaused ? <PlayButton onClick={() => { setIsPaused(false); isPausedRef.current = false; }} />
                    : <PauseButton onClick={() => { setIsPaused(true); isPausedRef.current = true; }} />}
                <SettingButton onClick={() => SettingsInfo.setShowSettings(true)} />
            </div>

        </div>
    );
};
