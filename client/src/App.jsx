import { useState, useRef, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import ToastContainer from './components/Toast';
import Terminal from './pages/Terminal';
import LivePanels from './components/LivePanels';
import './App.css';

export default function App() {
  const [splitRatio, setSplitRatio] = useState(60);
  const dividerRef = useRef(null);
  const isDragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      setSplitRatio(Math.min(80, Math.max(20, pct)));
    };
    const onMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <BrowserRouter>
      <AppProvider>
        <div className="app app-split">
          <div className="split-left" style={{ flex: `0 0 ${splitRatio}%` }}>
            <Routes>
              <Route path="/*" element={<Terminal embedded />} />
            </Routes>
          </div>
          <div
            className="split-divider"
            ref={dividerRef}
            onMouseDown={onMouseDown}
          />
          <div className="split-right" style={{ flex: `1 1 ${100 - splitRatio}%` }}>
            <LivePanels />
          </div>
          <ToastContainer />
        </div>
      </AppProvider>
    </BrowserRouter>
  );
}
