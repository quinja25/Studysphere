import React, { useState, useRef, useEffect } from 'react';
import './AmbientSound.css';

const SOUNDS = [
    { id: 'off',   label: 'Off',         icon: '—' },
    { id: 'white', label: 'White Noise',  icon: '〰' },
    { id: 'brown', label: 'Brown Noise',  icon: '🌊' },
    { id: 'rain',  label: 'Rain',         icon: '🌧' },
    { id: 'cafe',  label: 'Cafe',         icon: '☕' },
];

const buildNoiseBuffer = (ctx, type) => {
    const bufSize = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);

    if (type === 'brown') {
        let last = 0;
        for (let i = 0; i < bufSize; i++) {
            const w = Math.random() * 2 - 1;
            data[i] = (last + 0.02 * w) / 1.02;
            last = data[i];
            data[i] *= 3.5;
        }
    } else {
        // white / base for rain & cafe
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    }
    return buf;
};

const startNodes = (ctx, type, gainNode) => {
    const nodes = [];

    const makeSource = (buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        nodes.push(src);
        return src;
    };

    const makeFilter = (filterType, freq, q = 1) => {
        const f = ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.value = freq;
        f.Q.value = q;
        nodes.push(f);
        return f;
    };

    if (type === 'white') {
        const src = makeSource(buildNoiseBuffer(ctx, 'white'));
        src.connect(gainNode);
        src.start();

    } else if (type === 'brown') {
        const src = makeSource(buildNoiseBuffer(ctx, 'brown'));
        const lp = makeFilter('lowpass', 400);
        src.connect(lp);
        lp.connect(gainNode);
        src.start();

    } else if (type === 'rain') {
        // High-pass layer: hiss of rain on surfaces
        const src1 = makeSource(buildNoiseBuffer(ctx, 'white'));
        const hp = makeFilter('highpass', 1000);
        src1.connect(hp);
        hp.connect(gainNode);
        src1.start();

        // Low-pass layer: deeper rumble of heavy rain
        const src2 = makeSource(buildNoiseBuffer(ctx, 'white'));
        const lp = makeFilter('lowpass', 300);
        const g2 = ctx.createGain();
        g2.gain.value = 0.4;
        nodes.push(g2);
        src2.connect(lp);
        lp.connect(g2);
        g2.connect(gainNode);
        src2.start();

    } else if (type === 'cafe') {
        // Background rumble (crowd/room)
        const src1 = makeSource(buildNoiseBuffer(ctx, 'brown'));
        const lp = makeFilter('lowpass', 600);
        const g1 = ctx.createGain();
        g1.gain.value = 0.5;
        nodes.push(g1);
        src1.connect(lp);
        lp.connect(g1);
        g1.connect(gainNode);
        src1.start();

        // Midrange layer: muffled voices
        const src2 = makeSource(buildNoiseBuffer(ctx, 'white'));
        const bp = makeFilter('bandpass', 900, 0.4);
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        nodes.push(g2);
        src2.connect(bp);
        bp.connect(g2);
        g2.connect(gainNode);
        src2.start();
    }

    return nodes;
};

const AmbientSound = ({ onClose }) => {
    const [active, setActive] = useState('off');
    const [volume, setVolume] = useState(0.25);
    const ctxRef    = useRef(null);
    const gainRef   = useRef(null);
    const nodesRef  = useRef([]);

    const stopAll = () => {
        nodesRef.current.forEach(n => {
            try { if (n.stop) n.stop(); } catch (_) {}
            try { n.disconnect(); } catch (_) {}
        });
        nodesRef.current = [];
        if (gainRef.current) {
            try { gainRef.current.disconnect(); } catch (_) {}
            gainRef.current = null;
        }
    };

    useEffect(() => {
        stopAll();
        if (active === 'off') return;

        if (!ctxRef.current) {
            ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = ctxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const gain = ctx.createGain();
        gain.gain.value = volume;
        gain.connect(ctx.destination);
        gainRef.current = gain;

        const nodes = startNodes(ctx, active, gain);
        nodesRef.current = nodes;

        return stopAll;
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (gainRef.current) gainRef.current.gain.value = volume;
    }, [volume]);

    useEffect(() => () => stopAll(), []);

    return (
        <div className="ambient-panel">
            <div className="ambient-header">
                <span>Ambient Sound</span>
                {onClose && <button className="ambient-close" onClick={onClose}>✕</button>}
            </div>
            <div className="ambient-options">
                {SOUNDS.map(s => (
                    <button
                        key={s.id}
                        className={`ambient-opt${active === s.id ? ' active' : ''}`}
                        onClick={() => setActive(s.id)}
                    >
                        <span className="ambient-opt-icon">{s.icon}</span>
                        <span className="ambient-opt-label">{s.label}</span>
                    </button>
                ))}
            </div>
            <div className={`ambient-volume${active === 'off' ? ' hidden' : ''}`}>
                <span className="ambient-vol-icon">🔈</span>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={volume}
                    onChange={e => setVolume(Number(e.target.value))}
                    className="ambient-slider"
                />
                <span className="ambient-vol-icon">🔊</span>
            </div>
        </div>
    );
};

export default AmbientSound;
