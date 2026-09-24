import React from 'react';

export default function RawMp4TestPlayer({ url }: { url: string }) {
  return (
    <div style={{
      width: '360px',
      maxWidth: '100%',
      background: '#000',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
      border: '1px solid #334155'
    }}>
      <video
        src={url}
        controls
        playsInline
        preload="auto"
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          aspectRatio: '9 / 16',
          background: '#000'
        }}
      />
    </div>
  );
}
