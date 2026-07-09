/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface TapeReelProps {
  isPlaying: boolean;
  progress: number; // 0 to 1 representing position in audio
  songName?: string;
}

export const TapeReel: React.FC<TapeReelProps> = ({ isPlaying, progress, songName }) => {
  // Calculate dynamic radius of Left and Right tape packs
  // Max tape pack radius = 32, Min tape core radius = 16
  const maxRadius = 32;
  const minRadius = 15;
  
  const leftTapeRadius = minRadius + (maxRadius - minRadius) * (1 - progress);
  const rightTapeRadius = minRadius + (maxRadius - minRadius) * progress;

  // Spoke rotation calculation
  // Let the rotation angle continuously increment if playing
  const rotationClass = isPlaying ? 'animate-spin' : '';
  const animationDurationStyle = isPlaying ? { animationDuration: '6s' } : {};

  return (
    <div 
      id="retro-cassette-deck" 
      className="relative w-full max-w-md mx-auto aspect-[1.6/1] bg-[#1a1816] rounded-xl border-4 border-[#2c2722] p-4 shadow-2xl flex flex-col justify-between overflow-hidden select-none"
      style={{
        backgroundImage: 'linear-gradient(135deg, #23201c 0%, #171513 100%)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), inset 0 2px 4px rgba(255,255,255,0.05)'
      }}
    >
      {/* Top cassette screw holes */}
      <div className="absolute top-2 left-2 w-2 h-2 rounded-full bg-[#11100e] shadow-inner" />
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#11100e] shadow-inner" />
      <div className="absolute bottom-2 left-2 w-2 h-2 rounded-full bg-[#11100e] shadow-inner" />
      <div className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-[#11100e] shadow-inner" />

      {/* Cassette Label */}
      <div className="w-full bg-[#dfd9c8] rounded-md border-2 border-[#a79c85] p-3 shadow-md flex flex-col justify-between h-[54%] relative overflow-hidden">
        {/* Subtle label lines */}
        <div className="absolute inset-0 bg-opacity-5 flex flex-col justify-around py-1 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(167, 156, 133, 0.15) 11px, rgba(167, 156, 133, 0.15) 12px)'
          }}
        />

        {/* Brand / Title Header */}
        <div className="flex justify-between items-center z-10 border-b border-[#a79c85] pb-1">
          <span className="text-[9px] font-mono font-bold text-[#564e3c] tracking-widest">RETRO C-90</span>
          <div className="flex space-x-1">
            <span className="px-1 text-[7px] font-mono font-black bg-[#564e3c] text-[#dfd9c8] rounded">A</span>
            <span className="px-1 text-[7px] font-mono font-black border border-[#564e3c] text-[#564e3c] rounded">NR</span>
          </div>
        </div>

        {/* Dynamic Song Name Display */}
        <div className="mt-1 z-10 text-center flex-grow flex flex-col justify-center">
          <div className="text-xs font-mono font-bold text-[#2e291e] line-clamp-1 truncate max-w-xs px-2 select-all selection:bg-amber-200">
            {songName ? songName : 'AWAITING REEL LOAD...'}
          </div>
          <div className="text-[7px] font-mono text-[#7a6f56] uppercase tracking-wider mt-0.5">
            {songName ? 'Lofi-Converted Vintage Sound' : 'Drop MP3 / WAV to begin conversion'}
          </div>
        </div>
      </div>

      {/* Center Reel Window area */}
      <div className="w-[85%] mx-auto bg-[#0d0c0b] rounded-lg border-[3px] border-[#22201d] h-[34%] flex justify-around items-center px-4 relative shadow-inner">
        
        {/* Transparent glass tape bridge */}
        <div className="absolute inset-x-12 top-0 bottom-0 bg-[#121110] bg-opacity-80 border-x-2 border-[#1e1c1a] flex items-center justify-center">
          {/* Subtle horizontal guideline and reel indicator */}
          <div className="w-[80%] h-[1px] bg-[#22201d]" />
        </div>

        {/* Left Reel Hub */}
        <div className="relative w-16 h-16 flex items-center justify-center z-10">
          {/* Dark backing representing physical depth */}
          <div className="absolute w-16 h-16 rounded-full bg-[#070606] shadow-md border border-[#222] overflow-hidden">
            {/* Dark tape rolled up */}
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#181615] border border-[#222] shadow-inner transition-all duration-300"
              style={{
                width: `${leftTapeRadius * 2}px`,
                height: `${leftTapeRadius * 2}px`,
              }}
            />
          </div>

          {/* Central Spinning Core Spindle */}
          <div 
            className={`absolute w-8 h-8 rounded-full bg-[#dad0bc] border-2 border-[#81745b] flex items-center justify-center ${rotationClass}`}
            style={animationDurationStyle}
          >
            {/* Cassette teeth/spokes */}
            <div className="absolute w-1.5 h-8 bg-[#81745b]" />
            <div className="absolute w-1.5 h-8 bg-[#81745b] rotate-60" />
            <div className="absolute w-1.5 h-8 bg-[#81745b] rotate-120" />
            <div className="absolute w-5 h-5 rounded-full bg-[#dad0bc] z-10 border border-[#81745b]" />
            <div className="absolute w-2 h-2 rounded-full bg-[#0d0c0b] z-20 shadow-inner" />
          </div>
        </div>

        {/* Right Reel Hub */}
        <div className="relative w-16 h-16 flex items-center justify-center z-10">
          {/* Dark backing representing physical depth */}
          <div className="absolute w-16 h-16 rounded-full bg-[#070606] shadow-md border border-[#222] overflow-hidden">
            {/* Dark tape rolled up (grows as progress increases) */}
            <div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#181615] border border-[#222] shadow-inner transition-all duration-300"
              style={{
                width: `${rightTapeRadius * 2}px`,
                height: `${rightTapeRadius * 2}px`,
              }}
            />
          </div>

          {/* Central Spinning Core Spindle */}
          <div 
            className={`absolute w-8 h-8 rounded-full bg-[#dad0bc] border-2 border-[#81745b] flex items-center justify-center ${rotationClass}`}
            style={animationDurationStyle}
          >
            {/* Cassette teeth/spokes */}
            <div className="absolute w-1.5 h-8 bg-[#81745b]" />
            <div className="absolute w-1.5 h-8 bg-[#81745b] rotate-60" />
            <div className="absolute w-1.5 h-8 bg-[#81745b] rotate-120" />
            <div className="absolute w-5 h-5 rounded-full bg-[#dad0bc] z-10 border border-[#81745b]" />
            <div className="absolute w-2 h-2 rounded-full bg-[#0d0c0b] z-20 shadow-inner" />
          </div>
        </div>

        {/* Real-time Progress Tape Gloss glare */}
        <div className="absolute right-3 top-2 text-[6px] font-mono text-[#5a5448]">
          {isPlaying ? 'TAPE RUNNING' : 'TAPE SUSPENDED'}
        </div>
      </div>
    </div>
  );
};
