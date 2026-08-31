import React, { useState } from 'react';
import { X, Compass, Download, Info } from 'lucide-react';
import { formatCamelotKey, parseKeyToCamelot, getCamelotDistance } from '../../shared/harmonic.js';

interface CamelotWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedKey?: string; // Optional currently selected key to highlight
}

interface WheelSegment {
  number: number;
  letter: 'A' | 'B';
  keyName: string;
  color: string;
  angle: number; // in degrees (0 at top, 12 o'clock = 12B/12A or 1B/1A)
}

// 12 clock positions (1 to 12)
// Position 12 is at top (90 deg or -90 deg from horizontal)
const SEGMENTS_B: WheelSegment[] = [
  { number: 1, letter: 'B', keyName: 'B Maj', color: '#e65100', angle: 30 },
  { number: 2, letter: 'B', keyName: 'F# Maj', color: '#f57c00', angle: 60 },
  { number: 3, letter: 'B', keyName: 'Db Maj', color: '#ffb300', angle: 90 },
  { number: 4, letter: 'B', keyName: 'Ab Maj', color: '#fdd835', angle: 120 },
  { number: 5, letter: 'B', keyName: 'Eb Maj', color: '#c0ca33', angle: 150 },
  { number: 6, letter: 'B', keyName: 'Bb Maj', color: '#7cb342', angle: 180 },
  { number: 7, letter: 'B', keyName: 'F Maj', color: '#43a047', angle: 210 },
  { number: 8, letter: 'B', keyName: 'C Maj', color: '#00acc1', angle: 240 },
  { number: 9, letter: 'B', keyName: 'G Maj', color: '#039be5', angle: 270 },
  { number: 10, letter: 'B', keyName: 'D Maj', color: '#1e88e5', angle: 300 },
  { number: 11, letter: 'B', keyName: 'A Maj', color: '#3949ab', angle: 330 },
  { number: 12, letter: 'B', keyName: 'E Maj', color: '#8e24aa', angle: 0 },
];

const SEGMENTS_A: WheelSegment[] = [
  { number: 1, letter: 'A', keyName: 'G#m', color: '#bf360c', angle: 30 },
  { number: 2, letter: 'A', keyName: 'D#m', color: '#e64a19', angle: 60 },
  { number: 3, letter: 'A', keyName: 'Bbm', color: '#ff8f00', angle: 90 },
  { number: 4, letter: 'A', keyName: 'Fm', color: '#fbc02d', angle: 120 },
  { number: 5, letter: 'A', keyName: 'Cm', color: '#9e9d24', angle: 150 },
  { number: 6, letter: 'A', keyName: 'Gm', color: '#558b2f', angle: 180 },
  { number: 7, letter: 'A', keyName: 'Dm', color: '#2e7d32', angle: 210 },
  { number: 8, letter: 'A', keyName: 'Am', color: '#00838f', angle: 240 },
  { number: 9, letter: 'A', keyName: 'Em', color: '#0277bd', angle: 270 },
  { number: 10, letter: 'A', keyName: 'Bm', color: '#1565c0', angle: 300 },
  { number: 11, letter: 'A', keyName: 'F#m', color: '#283593', angle: 330 },
  { number: 12, letter: 'A', keyName: 'C#m', color: '#6a1b9a', angle: 0 },
];

export const CamelotWheelModal: React.FC<CamelotWheelModalProps> = ({
  isOpen,
  onClose,
  selectedKey,
}) => {
  const initialParsed = parseKeyToCamelot(selectedKey);
  const [activeKey, setActiveKey] = useState<{ number: number; letter: 'A' | 'B' } | null>(
    initialParsed ? { number: initialParsed.number, letter: initialParsed.letter } : { number: 8, letter: 'A' }
  );

  if (!isOpen) return null;

  // Helper to calculate SVG donut slice path
  const createDonutSlicePath = (
    cx: number,
    cy: number,
    innerR: number,
    outerR: number,
    startAngleDeg: number,
    endAngleDeg: number
  ) => {
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const startRad = toRad(startAngleDeg);
    const endRad = toRad(endAngleDeg);

    const x1 = cx + outerR * Math.cos(startRad);
    const y1 = cy + outerR * Math.sin(startRad);
    const x2 = cx + outerR * Math.cos(endRad);
    const y2 = cy + outerR * Math.sin(endRad);

    const x3 = cx + innerR * Math.cos(endRad);
    const y3 = cy + innerR * Math.sin(endRad);
    const x4 = cx + innerR * Math.cos(startRad);
    const y4 = cy + innerR * Math.sin(startRad);

    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 0 0 ${x4} ${y4} Z`;
  };

  // Helper to compute relationship of any key to activeKey
  const getRelationInfo = (seg: WheelSegment) => {
    if (!activeKey) return null;
    const dist = getCamelotDistance(activeKey, { number: seg.number, letter: seg.letter });
    const isSelected = activeKey.number === seg.number && activeKey.letter === seg.letter;
    const isRelative = activeKey.number === seg.number && activeKey.letter !== seg.letter;
    const isAdjacent = dist === 1;
    const isEnergyBoost = dist === 2;

    return {
      dist,
      isSelected,
      isRelative,
      isAdjacent,
      isEnergyBoost,
    };
  };

  const downloadSvg = () => {
    const svgEl = document.getElementById('camelot-wheel-svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'Camelot_Wheel_Harmonic_Mixing_Chart.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#0c1020] border border-violet-700/60 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-6 animate-fadeIn max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-violet-950/80 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white shadow-glow-violet">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
                <span>The Camelot Wheel</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-950 border border-violet-700/60 text-[10px] text-violet-300 font-mono">
                  Harmonic Mixing Chart
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Interactive Circle of Fifths & Harmonic Compatibility System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={downloadSvg}
              className="px-3 py-1.5 rounded-xl bg-[#141b33] hover:bg-violet-950/80 border border-violet-800/40 text-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download high-resolution vector SVG"
            >
              <Download className="w-3.5 h-3.5 text-violet-400" />
              <span>Download SVG</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1 flex-1 items-center">
          {/* Left Column: Interactive Vector SVG Wheel */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center p-2">
            <svg
              id="camelot-wheel-svg"
              viewBox="0 0 500 500"
              className="w-full max-w-[380px] h-auto drop-shadow-2xl select-none"
            >
              <defs>
                <filter id="glow-filter" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Background circular plate */}
              <circle cx="250" cy="250" r="240" fill="#070a14" stroke="#1e293b" strokeWidth="2" />

              {/* Outer Ring: B (Major Keys) */}
              {SEGMENTS_B.map((seg) => {
                const startDeg = seg.angle - 15;
                const endDeg = seg.angle + 15;
                const pathData = createDonutSlicePath(250, 250, 160, 235, startDeg, endDeg);
                const rel = getRelationInfo(seg);
                const isCurrent = activeKey?.number === seg.number && activeKey?.letter === 'B';

                // Text coordinates
                const midRad = ((seg.angle - 90) * Math.PI) / 180;
                const tx = 250 + 197 * Math.cos(midRad);
                const ty = 250 + 197 * Math.sin(midRad);

                return (
                  <g
                    key={`B-${seg.number}`}
                    onClick={() => setActiveKey({ number: seg.number, letter: 'B' })}
                    className="cursor-pointer transition-all duration-200"
                  >
                    <path
                      d={pathData}
                      fill={seg.color}
                      fillOpacity={isCurrent ? 1 : rel?.isAdjacent || rel?.isRelative ? 0.85 : 0.45}
                      stroke={isCurrent ? '#ffffff' : '#070a14'}
                      strokeWidth={isCurrent ? 3.5 : 2}
                      filter={isCurrent ? 'url(#glow-filter)' : undefined}
                      className="hover:opacity-100 transition-opacity"
                    />
                    <text
                      x={tx}
                      y={ty - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize="14"
                      fontWeight="900"
                      className="pointer-events-none font-mono"
                    >
                      {seg.number}B
                    </text>
                    <text
                      x={tx}
                      y={ty + 10}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fillOpacity="0.9"
                      fontSize="9"
                      fontWeight="700"
                      className="pointer-events-none font-sans"
                    >
                      {seg.keyName}
                    </text>
                  </g>
                );
              })}

              {/* Inner Ring: A (Minor Keys) */}
              {SEGMENTS_A.map((seg) => {
                const startDeg = seg.angle - 15;
                const endDeg = seg.angle + 15;
                const pathData = createDonutSlicePath(250, 250, 85, 155, startDeg, endDeg);
                const rel = getRelationInfo(seg);
                const isCurrent = activeKey?.number === seg.number && activeKey?.letter === 'A';

                // Text coordinates
                const midRad = ((seg.angle - 90) * Math.PI) / 180;
                const tx = 250 + 120 * Math.cos(midRad);
                const ty = 250 + 120 * Math.sin(midRad);

                return (
                  <g
                    key={`A-${seg.number}`}
                    onClick={() => setActiveKey({ number: seg.number, letter: 'A' })}
                    className="cursor-pointer transition-all duration-200"
                  >
                    <path
                      d={pathData}
                      fill={seg.color}
                      fillOpacity={isCurrent ? 1 : rel?.isAdjacent || rel?.isRelative ? 0.85 : 0.45}
                      stroke={isCurrent ? '#ffffff' : '#070a14'}
                      strokeWidth={isCurrent ? 3.5 : 2}
                      filter={isCurrent ? 'url(#glow-filter)' : undefined}
                      className="hover:opacity-100 transition-opacity"
                    />
                    <text
                      x={tx}
                      y={ty - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize="13"
                      fontWeight="900"
                      className="pointer-events-none font-mono"
                    >
                      {seg.number}A
                    </text>
                    <text
                      x={tx}
                      y={ty + 9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fillOpacity="0.9"
                      fontSize="9"
                      fontWeight="700"
                      className="pointer-events-none font-sans"
                    >
                      {seg.keyName}
                    </text>
                  </g>
                );
              })}

              {/* Center Core */}
              <circle cx="250" cy="250" r="78" fill="#070a14" stroke="#7c3aed" strokeWidth="2.5" />
              <text
                x="250"
                y="238"
                textAnchor="middle"
                fill="#a78bfa"
                fontSize="11"
                fontWeight="800"
                className="font-mono uppercase tracking-wider"
              >
                CAMELOT
              </text>
              <text
                x="250"
                y="262"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="20"
                fontWeight="900"
                className="font-mono"
              >
                {activeKey ? formatCamelotKey(activeKey) : 'WHEEL'}
              </text>
            </svg>

            <span className="text-[11px] text-slate-400 mt-2">
              💡 Click any key segment on the wheel to explore compatible transitions
            </span>
          </div>

          {/* Right Column: Key Diagnostic & Transition Guide */}
          <div className="lg:col-span-5 space-y-4">
            {/* Active Selected Key Card */}
            {activeKey && (
              <div className="p-4 rounded-2xl bg-[#080c18] border border-violet-800/60 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 uppercase font-mono font-bold tracking-wider">
                    Selected Key
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-950 border border-violet-600 text-xs font-mono font-extrabold text-violet-300">
                    {formatCamelotKey(activeKey)} ({activeKey.letter === 'A' ? 'Minor' : 'Major'})
                  </span>
                </div>

                {/* Transition Rules for Selected Key */}
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span className="text-emerald-300 font-semibold">Exact Lock (0 Steps):</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {formatCamelotKey(activeKey)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-teal-950/40 border border-teal-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-400"></span>
                      <span className="text-teal-300 font-semibold">Relative {activeKey.letter === 'A' ? 'Major' : 'Minor'} (0 Steps):</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {activeKey.number}{activeKey.letter === 'A' ? 'B' : 'A'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      <span className="text-cyan-300 font-semibold">Adjacent (±1 Step):</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {(activeKey.number % 12) + 1}{activeKey.letter} (Lift) /{' '}
                      {activeKey.number === 1 ? 12 : activeKey.number - 1}{activeKey.letter} (Warm)
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <span className="text-amber-300 font-semibold">Energy Boost (±2 Steps):</span>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {((activeKey.number + 1) % 12) + 1}{activeKey.letter} (+2) /{' '}
                      {activeKey.number <= 2 ? activeKey.number + 10 : activeKey.number - 2}{activeKey.letter} (-2)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick Rules Reference */}
            <div className="p-4 rounded-2xl bg-[#080c18] border border-[#1e293b] space-y-2.5 text-xs text-slate-300">
              <h4 className="font-bold text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>Harmonic Mixing Cheat Sheet</span>
              </h4>
              <ul className="space-y-1.5 text-[11px] text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="text-violet-400 font-bold">•</span>
                  <span><strong>Stay in the same number</strong> to switch between uplifting major and dark minor moods seamlessly.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-violet-400 font-bold">•</span>
                  <span><strong>Move +1 step clockwise</strong> (e.g. 8A to 9A) to create a euphoric musical energy lift.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-violet-400 font-bold">•</span>
                  <span><strong>Move +2 steps</strong> (e.g. 8A to 10A) for dramatic peak-time energy transitions.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-violet-950/80 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs transition-all shadow-md"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
