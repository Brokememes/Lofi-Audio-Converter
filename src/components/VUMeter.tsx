/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

interface VUMeterProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export const VUMeter: React.FC<VUMeterProps> = ({ analyserNode, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const currentLevelRef = useRef<number>(0); // for smoothing/damping the needle

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bufferLength = 0;
    let dataArray = new Uint8Array(0);

    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      // 1. Calculate current audio signal volume level
      let level = 0;
      if (analyserNode && isPlaying) {
        analyserNode.getByteFrequencyData(dataArray);
        let sum = 0;
        // Focus on mid-low frequencies which are dominant in VU metrics
        const focusRange = Math.min(bufferLength, 30);
        for (let i = 0; i < focusRange; i++) {
          sum += dataArray[i];
        }
        level = sum / (focusRange * 255); // 0 to 1
      }

      // 2. Smooth/Dampen the needle movement (slower fall, fast rise)
      const targetLevel = level;
      if (targetLevel > currentLevelRef.current) {
        currentLevelRef.current += (targetLevel - currentLevelRef.current) * 0.35; // fast rise
      } else {
        currentLevelRef.current += (targetLevel - currentLevelRef.current) * 0.12; // slower fall
      }

      // Add a slight retro jitter to the needle when active
      if (isPlaying && currentLevelRef.current > 0.05) {
        currentLevelRef.current += (Math.random() - 0.5) * 0.015;
      }

      // Limit bounds
      currentLevelRef.current = Math.max(0, Math.min(1.1, currentLevelRef.current));

      // 3. Clear canvas & Draw background
      ctx.clearRect(0, 0, width, height);

      // Draw bezel background
      const gradBg = ctx.createLinearGradient(0, 0, 0, height);
      gradBg.addColorStop(0, '#1c1b18'); // deep retro charcoal
      gradBg.addColorStop(1, '#12110f');
      ctx.fillStyle = gradBg;
      ctx.fillRect(0, 0, width, height);

      // Draw glowing meter face (warm amber/yellow)
      const faceX = 10;
      const faceY = 10;
      const faceW = width - 20;
      const faceH = height - 15;
      const faceRadius = 8;

      ctx.beginPath();
      ctx.roundRect(faceX, faceY, faceW, faceH, faceRadius);
      ctx.fillStyle = '#f8e0a0'; // vintage glowing paper amber
      ctx.fill();

      // Shadow overlay inside face for depth
      ctx.beginPath();
      ctx.roundRect(faceX, faceY, faceW, faceH, faceRadius);
      ctx.strokeStyle = '#8b774a';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Glowing warm bulb effect at the top
      const bulbGrad = ctx.createRadialGradient(
        width / 2, faceY - 5, 2,
        width / 2, faceY + 15, faceW / 2
      );
      bulbGrad.addColorStop(0, 'rgba(255, 240, 180, 0.45)');
      bulbGrad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = bulbGrad;
      ctx.fillRect(faceX, faceY, faceW, faceH);

      // 4. Draw Scale Markings (Arc)
      const centerX = width / 2;
      const centerY = height + 45; // Pivot point is below the canvas
      const arcRadius = height + 10;

      ctx.strokeStyle = 'rgba(60, 50, 30, 0.75)';
      ctx.lineWidth = 1;

      // Outer Scale Arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, arcRadius, -Math.PI * 0.72, -Math.PI * 0.28);
      ctx.stroke();

      // Draw ticks
      const startAngle = -Math.PI * 0.70;
      const endAngle = -Math.PI * 0.30;
      const totalTicks = 11;

      for (let i = 0; i < totalTicks; i++) {
        const ratio = i / (totalTicks - 1);
        const angle = startAngle + ratio * (endAngle - startAngle);
        
        // Red zone for last 3 ticks (overloading saturation)
        const isRedZone = i >= 8;
        ctx.strokeStyle = isRedZone ? 'rgba(180, 30, 30, 0.85)' : 'rgba(60, 50, 30, 0.75)';
        ctx.lineWidth = isRedZone ? 2 : 1;

        const tickLength = i % 2 === 0 ? 8 : 4;
        const x1 = centerX + Math.cos(angle) * arcRadius;
        const y1 = centerY + Math.sin(angle) * arcRadius;
        const x2 = centerX + Math.cos(angle) * (arcRadius - tickLength);
        const y2 = centerY + Math.sin(angle) * (arcRadius - tickLength);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Scale Labels (0, VU, +1, +3 dB etc)
        if (i % 2 === 0) {
          ctx.fillStyle = isRedZone ? '#a01515' : '#3c321e';
          ctx.font = '7px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const labelAngle = angle;
          const lx = centerX + Math.cos(labelAngle) * (arcRadius - 14);
          const ly = centerY + Math.sin(labelAngle) * (arcRadius - 14) + 2;
          
          let label = '';
          if (i === 0) label = '-20';
          else if (i === 2) label = '-10';
          else if (i === 4) label = '-5';
          else if (i === 6) label = '0';
          else if (i === 8) label = '+1';
          else if (i === 10) label = '+3';
          
          ctx.fillText(label, lx, ly);
        }
      }

      // Draw "VU" and "LO-FI" text labels in the face
      ctx.fillStyle = 'rgba(100, 85, 55, 0.6)';
      ctx.font = 'bold 8px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ANALOG LEVEL', width / 2, height / 2 + 3);

      ctx.font = '5px "JetBrains Mono", monospace';
      ctx.fillText('RETRO ERA SENSOR', width / 2, height / 2 + 11);

      // 5. Draw the Needle
      const currentAngle = startAngle + currentLevelRef.current * (endAngle - startAngle);
      const needleLength = arcRadius + 5;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Needle base gradient
      ctx.strokeStyle = '#c01c1c'; // Physical matte red needle
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';

      ctx.beginPath();
      const nx = centerX + Math.cos(currentAngle) * (centerY - 100);
      const ny = centerY + Math.sin(currentAngle) * (centerY - 100);
      const targetX = centerX + Math.cos(currentAngle) * needleLength;
      const targetY = centerY + Math.sin(currentAngle) * needleLength;
      
      // We start drawing from inside the gauge pivot
      ctx.moveTo(nx, ny);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();

      // Reset shadows
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 6. Draw Pivot Cover Cap (black/metal circular screw)
      const pivotRadius = 14;
      ctx.beginPath();
      ctx.arc(centerX, centerY, pivotRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#1e1c18';
      ctx.fill();

      // Highlight on screw
      ctx.beginPath();
      ctx.arc(centerX - 3, centerY - 3, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3c3830';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(centerX, centerY, pivotRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#12110f';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 7. Ambient glare glass effect overlay
      const glareGrad = ctx.createLinearGradient(0, 0, width, height);
      glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      glareGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.08)');
      glareGrad.addColorStop(0.31, 'rgba(255, 255, 255, 0)');
      glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glareGrad;
      ctx.fillRect(faceX, faceY, faceW, faceH);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserNode, isPlaying]);

  return (
    <div id="retro-vu-meter" className="relative p-1 rounded bg-[#0f0e0d] border border-[#2a2824] shadow-inner w-full md:w-56 h-28">
      <canvas
        ref={canvasRef}
        width={224}
        height={104}
        className="w-full h-full block rounded"
      />
    </div>
  );
};
