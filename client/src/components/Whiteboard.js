import React, { useRef, useEffect, useState, useCallback } from 'react';
import './Whiteboard.css';

const Whiteboard = ({ socket, room }) => {
    const canvasRef = useRef(null);
    const isDrawingRef = useRef(false);
    const lastPosRef = useRef({ x: 0, y: 0 });
    const strokeBufferRef = useRef([]);

    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#1a1a1a');
    const [lineWidth, setLineWidth] = useState(4);

    const getPos = (e, canvas) => {
        const rect = canvas.getBoundingClientRect();
        if (e.touches) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top,
            };
        }
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const drawSegment = useCallback((ctx, from, to, strokeColor, width) => {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }, []);

    const replayStroke = useCallback((ctx, data) => {
        if (!data.points || data.points.length < 2) return;
        for (let i = 1; i < data.points.length; i++) {
            drawSegment(ctx, data.points[i - 1], data.points[i], data.color, data.width);
        }
    }, [drawSegment]);

    const clearCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    // Resize canvas to match container without clearing content
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const resize = () => {
            const container = canvas.parentElement;
            if (!container) return;
            // Snapshot current drawing before resize
            const imageData = canvas.toDataURL();
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            // Restore white background
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            // Restore drawing
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = imageData;
        };

        const observer = new ResizeObserver(resize);
        observer.observe(canvas.parentElement);
        resize();
        return () => observer.disconnect();
    }, []);

    // Socket listeners for collaboration
    useEffect(() => {
        if (!socket) return;

        const handleDraw = (data) => {
            if (String(data.room) !== String(room)) return;
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx) replayStroke(ctx, data);
        };

        const handleClear = (data) => {
            if (String(data.room) !== String(room)) return;
            clearCanvas();
        };

        socket.on('whiteboard_draw', handleDraw);
        socket.on('whiteboard_clear', handleClear);
        return () => {
            socket.off('whiteboard_draw', handleDraw);
            socket.off('whiteboard_clear', handleClear);
        };
    }, [socket, room, replayStroke, clearCanvas]);

    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        const pos = getPos(e, canvas);
        isDrawingRef.current = true;
        lastPosRef.current = pos;
        strokeBufferRef.current = [pos];
        e.preventDefault();
    };

    const draw = (e) => {
        if (!isDrawingRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e, canvas);
        const strokeColor = tool === 'eraser' ? '#ffffff' : color;
        const width = tool === 'eraser' ? lineWidth * 4 : lineWidth;

        drawSegment(ctx, lastPosRef.current, pos, strokeColor, width);
        strokeBufferRef.current.push(pos);
        lastPosRef.current = pos;
        e.preventDefault();
    };

    const stopDrawing = () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;

        if (socket && strokeBufferRef.current.length > 1) {
            socket.emit('whiteboard_draw', {
                room,
                points: strokeBufferRef.current,
                color: tool === 'eraser' ? '#ffffff' : color,
                width: tool === 'eraser' ? lineWidth * 4 : lineWidth,
            });
        }
        strokeBufferRef.current = [];
    };

    const handleClearClick = () => {
        clearCanvas();
        if (socket) socket.emit('whiteboard_clear', { room });
    };

    return (
        <div className="whiteboard-container">
            <div className="whiteboard-toolbar">
                <button
                    className={`wb-tool-btn ${tool === 'pen' ? 'active' : ''}`}
                    onClick={() => setTool('pen')}
                    title="Pen"
                >
                    Pen
                </button>
                <button
                    className={`wb-tool-btn ${tool === 'eraser' ? 'active' : ''}`}
                    onClick={() => setTool('eraser')}
                    title="Eraser"
                >
                    Eraser
                </button>

                <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    title="Color"
                    className="wb-color-picker"
                    disabled={tool === 'eraser'}
                />

                <div className="wb-width-control">
                    <span className="wb-width-label">{lineWidth}px</span>
                    <input
                        type="range"
                        min="1"
                        max="24"
                        value={lineWidth}
                        onChange={(e) => setLineWidth(Number(e.target.value))}
                        className="wb-width-slider"
                    />
                </div>

                <button className="wb-clear-btn" onClick={handleClearClick} title="Clear board">
                    Clear
                </button>
            </div>

            <div className="whiteboard-canvas-wrapper">
                <canvas
                    ref={canvasRef}
                    className="whiteboard-canvas"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
            </div>
        </div>
    );
};

export default Whiteboard;
