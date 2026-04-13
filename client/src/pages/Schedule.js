import React, { useState, useEffect } from 'react';
import { NavBar } from '../components/NavBar';
import { useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import './Schedule.css';
import { SlPlus, SlClock, SlLocationPin } from "react-icons/sl";

export const Schedule = () => {
    const [events, setEvents] = useState([]);
    const [token, setToken] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [newEvent, setNewEvent] = useState({
        summary: '',
        description: '',
        start: '',
        end: ''
    });

    const login = useGoogleLogin({
        onSuccess: (codeResponse) => setToken(codeResponse),
        scope: 'https://www.googleapis.com/auth/calendar',
        onError: (error) => console.log('Login Failed:', error)
    });

    useEffect(() => {
        if (token) {
            fetchEvents();
        }
    }, [token]);

    const fetchEvents = async () => {
        try {
            const response = await axios.get('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                headers: { Authorization: `Bearer ${token.access_token}` },
                params: {
                    timeMin: new Date().toISOString(),
                    showDeleted: false,
                    singleEvents: true,
                    maxResults: 10,
                    orderBy: 'startTime'
                }
            });
            setEvents(response.data.items);
        } catch (error) {
            console.error("Error fetching events:", error);
        }
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        if (!token) return;
        
        const event = {
            summary: newEvent.summary,
            description: newEvent.description,
            start: {
                dateTime: new Date(newEvent.start).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            end: {
                dateTime: new Date(newEvent.end).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
        };

        try {
            await axios.post('https://www.googleapis.com/calendar/v3/calendars/primary/events', event, {
                headers: { Authorization: `Bearer ${token.access_token}` }
            });
            setShowForm(false);
            setNewEvent({ summary: '', description: '', start: '', end: '' });
            fetchEvents();
            alert('Study session scheduled successfully!');
        } catch (error) {
            console.error("Error creating event:", error);
            alert('Failed to schedule event.');
        }
    };

    return (
        <div className="schedule-page">
            <NavBar />
            <div className="schedule-container">
                <div className="schedule-header">
                    <h1>Study Schedule</h1>
                    {!token ? (
                        <button className="connect-btn" onClick={() => login()}>
                            Connect Google Calendar
                        </button>
                    ) : (
                        <button className="add-event-btn" onClick={() => setShowForm(!showForm)}>
                            <SlPlus /> Schedule Session
                        </button>
                    )}
                </div>

                {showForm && (
                    <div className="event-form-card">
                        <h3>New Study Session</h3>
                        <form onSubmit={handleCreateEvent}>
                            <div className="form-group">
                                <label>Title</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Math Study Group" 
                                    value={newEvent.summary} 
                                    onChange={(e) => setNewEvent({...newEvent, summary: e.target.value})} 
                                    required 
                                />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <input 
                                    type="text" 
                                    placeholder="Topics to cover..." 
                                    value={newEvent.description} 
                                    onChange={(e) => setNewEvent({...newEvent, description: e.target.value})} 
                                />
                            </div>
                            <div className="time-inputs">
                                <div className="form-group">
                                    <label>Start Time</label>
                                    <input 
                                        type="datetime-local" 
                                        value={newEvent.start} 
                                        onChange={(e) => setNewEvent({...newEvent, start: e.target.value})} 
                                        required 
                                    />
                                </div>
                                <div className="form-group">
                                    <label>End Time</label>
                                    <input 
                                        type="datetime-local" 
                                        value={newEvent.end} 
                                        onChange={(e) => setNewEvent({...newEvent, end: e.target.value})} 
                                        required 
                                    />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="save-event-btn">Save to Calendar</button>
                            </div>
                        </form>
                    </div>
                )}

                <div className="events-list">
                    <h2>Upcoming Sessions</h2>
                    {events.length > 0 ? (
                        <div className="events-grid">
                            {events.map(event => (
                                <div key={event.id} className="event-card">
                                    <div className="event-time-badge">
                                        <span className="event-month">{new Date(event.start.dateTime || event.start.date).toLocaleString('default', { month: 'short' })}</span>
                                        <span className="event-day">{new Date(event.start.dateTime || event.start.date).getDate()}</span>
                                    </div>
                                    <div className="event-details">
                                        <h4>{event.summary}</h4>
                                        <div className="event-meta">
                                            <span className="meta-item"><SlClock /> {new Date(event.start.dateTime || event.start.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            {event.location && <span className="meta-item"><SlLocationPin /> {event.location}</span>}
                                        </div>
                                        {event.description && <p className="event-desc">{event.description}</p>}
                                        <a href={event.htmlLink} target="_blank" rel="noreferrer" className="view-link">View in Calendar</a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="no-events">
                            <p>{token ? "No upcoming study sessions found." : "Connect your Google Calendar to manage your study schedule."}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};