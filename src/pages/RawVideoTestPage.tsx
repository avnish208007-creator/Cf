import React, { useRef, useState, useEffect } from 'react';

export const RawVideoTestPage: React.FC = () => {
  const testUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [diag, setDiag] = useState({
    currentTime: 0,
    duration: 0,
    readyState: 0,
    networkState: 0,
    paused: true,
    videoWidth: 0,
    videoHeight: 0,
    errorCode: null as number | null,
  });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const update = () => {
      setDiag({
        currentTime: v.currentTime || 0,
        duration: v.duration || 0,
        readyState: v.readyState,
        networkState: v.networkState,
        paused: v.paused,
        videoWidth: v.videoWidth || 0,
        videoHeight: v.videoHeight || 0,
        errorCode: v.error ? v.error.code : null,
      });
    };

    update();
    const interval = setInterval(update, 200);

    v.addEventListener('timeupdate', update);
    v.addEventListener('loadedmetadata', update);
    v.addEventListener('canplay', update);
    v.addEventListener('error', update);
    v.addEventListener('play', update);
    v.addEventListener('pause', update);

    return () => {
      clearInterval(interval);
      v.removeEventListener('timeupdate', update);
      v.removeEventListener('loadedmetadata', update);
      v.removeEventListener('canplay', update);
      v.removeEventListener('error', update);
      v.removeEventListener('play', update);
      v.removeEventListener('pause', update);
    };
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#000',
      color: '#fff',
      fontFamily: 'sans-serif',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px'
    }}>
      <video
        ref={videoRef}
        src={testUrl}
        controls
        playsInline
        preload="auto"
        style={{
          width: '360px',
          height: '640px',
          background: 'black',
          display: 'block'
        }}
      />

      <div style={{
        display: 'flex',
        gap: '8px',
        width: '360px'
      }}>
        <button
          onClick={() => {
            window.location.href = testUrl;
          }}
          style={{
            flex: 1,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          OPEN URL IN NEW TAB
        </button>
      </div>

      <div style={{
        background: '#111',
        border: '1px solid #333',
        borderRadius: '6px',
        padding: '12px',
        width: '360px',
        fontSize: '12px',
        fontFamily: 'monospace',
        color: '#ccc',
        lineHeight: '1.5'
      }}>
        <div><strong>URL:</strong> <span style={{ color: '#60a5fa', wordBreak: 'break-all' }}>{testUrl}</span></div>
        <div style={{ marginTop: '4px' }}><strong>currentTime:</strong> {diag.currentTime.toFixed(2)}s</div>
        <div><strong>duration:</strong> {diag.duration.toFixed(2)}s</div>
        <div><strong>readyState:</strong> {diag.readyState}</div>
        <div><strong>networkState:</strong> {diag.networkState}</div>
        <div><strong>paused:</strong> {diag.paused ? 'true' : 'false'}</div>
        <div><strong>videoWidth:</strong> {diag.videoWidth}</div>
        <div><strong>videoHeight:</strong> {diag.videoHeight}</div>
        <div><strong>error code:</strong> {diag.errorCode !== null ? diag.errorCode : 'none'}</div>
      </div>
    </div>
  );
};
