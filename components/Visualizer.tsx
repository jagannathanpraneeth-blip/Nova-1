import React, { useEffect, useRef } from 'react';
import { NovaStatus } from '../types';

interface VisualizerProps {
  inputAnalyser: AnalyserNode | null;
  outputAnalyser: AnalyserNode | null;
  status: NovaStatus;
}

const Visualizer: React.FC<VisualizerProps> = ({ inputAnalyser, outputAnalyser, status }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // Base circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
      ctx.strokeStyle = getStatusColor(status, 0.2);
      ctx.lineWidth = 2;
      ctx.stroke();

      // If Idle/Connecting, minimal animation
      if (status === NovaStatus.IDLE || status === NovaStatus.CONNECTING) {
         // subtle breathing
         const time = Date.now() / 1000;
         const radius = 50 + Math.sin(time * 2) * 3;
         ctx.beginPath();
         ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
         ctx.strokeStyle = getStatusColor(status, 0.5);
         ctx.stroke();
         requestRef.current = requestAnimationFrame(draw);
         return;
      }

      // Active Visualization
      let dataArray = new Uint8Array(0);
      
      // Prioritize Output (Nova speaking) over Input (User speaking) for visuals
      if (status === NovaStatus.SPEAKING && outputAnalyser) {
         dataArray = new Uint8Array(outputAnalyser.frequencyBinCount);
         outputAnalyser.getByteFrequencyData(dataArray);
      } else if ((status === NovaStatus.LISTENING || status === NovaStatus.THINKING) && inputAnalyser) {
         dataArray = new Uint8Array(inputAnalyser.frequencyBinCount);
         inputAnalyser.getByteFrequencyData(dataArray);
      }

      if (dataArray.length > 0) {
        const bufferLength = dataArray.length;
        // Draw circular bars
        const bars = 64;
        const step = Math.floor(bufferLength / bars);
        const radius = 60;

        for (let i = 0; i < bars; i++) {
          const value = dataArray[i * step];
          const percent = value / 255;
          const barHeight = percent * 100; 
          
          const angle = (i / bars) * 2 * Math.PI;
          
          const xStart = centerX + Math.cos(angle) * radius;
          const yStart = centerY + Math.sin(angle) * radius;
          const xEnd = centerX + Math.cos(angle) * (radius + barHeight);
          const yEnd = centerY + Math.sin(angle) * (radius + barHeight);

          ctx.beginPath();
          ctx.moveTo(xStart, yStart);
          ctx.lineTo(xEnd, yEnd);
          ctx.strokeStyle = getStatusColor(status, 0.8);
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }
      
      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [status, inputAnalyser, outputAnalyser]);

  const getStatusColor = (s: NovaStatus, alpha: number) => {
    switch (s) {
      case NovaStatus.IDLE: return `rgba(71, 85, 105, ${alpha})`; // Slate
      case NovaStatus.CONNECTING: return `rgba(250, 204, 21, ${alpha})`; // Yellow
      case NovaStatus.LISTENING: return `rgba(14, 165, 233, ${alpha})`; // Sky Blue
      case NovaStatus.THINKING: return `rgba(168, 85, 247, ${alpha})`; // Purple
      case NovaStatus.SPEAKING: return `rgba(16, 185, 129, ${alpha})`; // Emerald
      case NovaStatus.ERROR: return `rgba(239, 68, 68, ${alpha})`; // Red
      default: return `rgba(255, 255, 255, ${alpha})`;
    }
  };

  return (
    <canvas 
      ref={canvasRef} 
      width={500} 
      height={500} 
      className="w-full max-w-[450px] h-auto mx-auto"
    />
  );
};

export default Visualizer;