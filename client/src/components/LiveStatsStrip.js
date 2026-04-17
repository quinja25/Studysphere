import { useEffect, useState } from 'react';
import api from '../api';
import './LiveStatsStrip.css';

const formatMinutesAgo = (m) => {
    if (m == null) return '—';
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

const DEFAULT_STUDENT_ITEMS = [
    { key: 'studentsOnline', label: 'studying right now', dotWhen: 'positive' },
    { key: 'activeRooms', label: 'live rooms', dotWhen: 'positive' },
    { key: 'questionsLast24h', label: 'questions today' },
    { key: 'lastAnswerMinutesAgo', label: 'last answer', format: 'minutesAgo', mono: true },
];

const formatValue = (raw, format) => {
    if (format === 'minutesAgo') return formatMinutesAgo(raw);
    return raw ?? 0;
};

export const LiveStatsStrip = ({ items = DEFAULT_STUDENT_ITEMS }) => {
    const [stats, setStats] = useState(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchStats = () => {
            api.get('/public/stats')
                .then((res) => {
                    if (!cancelled) {
                        setStats(res.data);
                        setLoaded(true);
                    }
                })
                .catch(() => {
                    if (!cancelled) setLoaded(true);
                });
        };
        fetchStats();
        const id = setInterval(fetchStats, 60_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    return (
        <div className={`live-strip ${loaded ? 'loaded' : ''}`}>
            {items.map((it, i) => {
                const raw = stats?.[it.key];
                const val = formatValue(raw, it.format);
                const showDot = it.dotWhen === 'positive' && typeof raw === 'number' && raw > 0;
                return (
                    <div key={i} className="live-item">
                        {showDot && <span className="live-dot" />}
                        <span className={`live-val${it.mono ? ' mono' : ''}`}>{val}</span>
                        <span className="live-label">{it.label}</span>
                    </div>
                );
            })}
        </div>
    );
};

export default LiveStatsStrip;
