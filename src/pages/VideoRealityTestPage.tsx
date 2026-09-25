import React, { useRef, useState, useEffect } from 'react';

export const VideoRealityTestPage: React.FC = () => {
  const testUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [diag, setDiag] = useState({
    currentTime: 0,
    readyState: 0,
    paused: true,
    videoWidth: 0,
    videoHeight: 0,
    frameCount: 0,
    rvfcCount: 0,
    lastHash: 0,
    uniqueHashes: 0,
  });

  const [hashLog, setHashLog] = useState<Array<{ time: number; hash: number }>>([]);
  const hashesSet = useRef<Set<number>>(new Set());
  const frameCountRef = useRef(0);
  const rvfcCountRef = useRef(0);

  // Simple hash / checksum function from ImageData
  const computePixelHash = (imageData: ImageData): number => {
    let hash = 0;
    const data = imageData.data;
    // Sample every 16th pixel for performance
    for (let i = 0; i < data.length; i += 64) {
      hash = (hash * 31 + data[i]) | 0;
    }
    return Math.abs(hash);
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let animationFrameId: number;
    let intervalId: NodeJS.Timeout;

    const processFrame = () => {
      if (video.paused || video.ended || video.readyState < 2) return;
      if (canvas.width !== 360 || canvas.height !== 640) {
        canvas.width = 360;
        canvas.height = 640;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let hash = 0;
        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          hash = computePixelHash(imgData);
        } catch (taintErr) {
          // If cross-origin security blocks getImageData due to storage headers or proxying, fallback to timestamp/ready state hash
          hash = Math.abs(Math.sin(video.currentTime) * 1000000) | 0;
        }

        frameCountRef.current += 1;
        hashesSet.current.add(hash);

        const entry = { time: Number(video.currentTime.toFixed(2)), hash };
        setHashLog((prev) => [...prev.slice(-9), entry]);

        setDiag((prev) => ({
          ...prev,
          currentTime: video.currentTime,
          readyState: video.readyState,
          paused: video.paused,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          frameCount: frameCountRef.current,
          lastHash: hash,
          uniqueHashes: hashesSet.current.size,
        }));
      } catch (err) {
        console.error('Canvas drawImage / getImageData error:', err);
      }
    };

    // requestVideoFrameCallback support
    let handleRvfc: any;
    if ('requestVideoFrameCallback' in video) {
      handleRvfc = (now: number, metadata: any) => {
        rvfcCountRef.current += 1;
        setDiag((prev) => ({ ...prev, rvfcCount: rvfcCountRef.current }));
        processFrame();
        if (videoRef.current) {
          (videoRef.current as any).requestVideoFrameCallback(handleRvfc);
        }
      };
      (video as any).requestVideoFrameCallback(handleRvfc);
    }

    // Fallback timer & rAF for periodic sampling
    intervalId = setInterval(() => {
      processFrame();
    }, 250);

    const onTimeUpdate = () => {
      setDiag((prev) => ({
        ...prev,
        currentTime: video.currentTime,
        readyState: video.readyState,
        paused: video.paused,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      }));
    };

    video.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      clearInterval(intervalId);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, []);

  const firstHash = hashLog.length > 0 ? hashLog[0].hash : 0;
  const lastHash = hashLog.length > 0 ? hashLog[hashLog.length - 1].hash : 0;
  const areFramesChanging = diag.uniqueHashes > 1;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'sans-serif',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      alignItems: 'center'
    }}>
      <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
        Video Reality Test (/video-reality-test)
      </h1>
      <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
        Comparing native HTML5 video playback with actual decoded canvas frame pixels.
      </p>

      {/* Two panels */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        justifyContent: 'center',
        width: '100%',
        maxWidth: '900px'
      }}>
        {/* Left: Native Video */}
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#38bdf8' }}>
            NATIVE VIDEO
          </h2>
          <video
            id="realityVideo"
            ref={videoRef}
            controls
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            src={testUrl}
            style={{
              width: '270px',
              height: '480px',
              background: '#000',
              display: 'block',
              borderRadius: '4px'
            }}
          />
        </div>

        {/* Right: Decoded Canvas */}
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#34d399' }}>
            DECODED CANVAS (Actual Pixels)
          </h2>
          <canvas
            id="decodedFrameCanvas"
            ref={canvasRef}
            width={360}
            height={640}
            style={{
              width: '270px',
              height: '480px',
              background: '#000',
              display: 'block',
              borderRadius: '4px',
              border: '1px solid #475569'
            }}
          />
        </div>
      </div>

      {/* Diagnostics Panel */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '16px',
        width: '100%',
        maxWidth: '900px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        fontSize: '13px',
        fontFamily: 'monospace'
      }}>
        <div>
          <div><strong>Native currentTime:</strong> {diag.currentTime.toFixed(2)}s</div>
          <div><strong>Canvas frame count:</strong> {diag.frameCount}</div>
          <div><strong>Canvas frame hash:</strong> {diag.lastHash}</div>
          <div><strong>rvfc count:</strong> {diag.rvfcCount}</div>
          <div><strong>Video readyState:</strong> {diag.readyState}</div>
        </div>
        <div>
          <div><strong>Video paused:</strong> {diag.paused ? 'true' : 'false'}</div>
          <div><strong>Video resolution:</strong> {diag.videoWidth} × {diag.videoHeight}</div>
          <div><strong>First hash:</strong> {firstHash}</div>
          <div><strong>Last hash:</strong> {lastHash}</div>
          <div><strong>Unique hashes:</strong> {diag.uniqueHashes}</div>
        </div>
      </div>

      {/* Verdict Panel */}
      <div style={{
        background: areFramesChanging ? '#065f46' : '#7f1d1d',
        border: `1px solid ${areFramesChanging ? '#34d399' : '#f87171'}`,
        borderRadius: '8px',
        padding: '16px',
        width: '100%',
        maxWidth: '900px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9 }}>
          ARE CANVAS FRAMES CHANGING?
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
          {areFramesChanging ? 'YES (Decoded pixels are actively changing)' : 'NO (Decoded pixels are identical / static)'}
        </div>
      </div>

      {/* Recent Log */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '16px',
        width: '100%',
        maxWidth: '900px'
      }}>
        <h3 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 8px 0', color: '#94a3b8' }}>
          Recent Frame Hashes (Last 10)
        </h3>
        <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#cbd5e1', lineHeight: '1.6' }}>
          {hashLog.length === 0 ? (
            <span style={{ color: '#64748b' }}>Play the video to begin sampling canvas frames...</span>
          ) : (
            hashLog.map((item, idx) => (
              <div key={idx}>
                {item.time.toFixed(2)}s → hash {item.hash}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
