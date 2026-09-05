import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Activity, AlertTriangle, ShieldCheck, Gauge, Layers, Wifi, Radio,
  RefreshCw, Flame, CheckCircle2, Download, Bell, Settings2, MapPinned,
  XCircle, Compass, Mountain, ChevronRight, BookOpen, Info
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

/* ============================================================
   RELIABILITY MODEL — SIH Problem Statement 26049
   Every number this function returns is CALCULATED from the
   physics below, not measured from a real sensor. Low air
   pressure at altitude makes cooling less effective and makes
   air a weaker electrical insulator (a real effect known as
   Paschen's Law). Subzero ambient stresses solder joints and
   batteries. See the Glossary tab for a plain-language walk-
   through of every term and formula on this screen.
============================================================ */
const computeReliabilityModel = (inputs, mitigations, thresholds) => {
  const { altitude, ambientTemp, loadCurrent, vibration, humidity } = inputs;
  const { conformalCoating, pressurizedEnclosure, thermalPreheat } = mitigations;

  // Air pressure drops roughly exponentially with altitude (barometric formula).
  const pressure = 101.325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
  const airDensityRatio = pressure / 101.325;
  // A pressurized enclosure artificially restores some of that lost density.
  const effectiveDensity = pressurizedEnclosure ? airDensityRatio + (1 - airDensityRatio) * 0.6 : airDensityRatio;

  // Pre-heating effectively "warms" the ambient temperature the equipment feels.
  const preheatOffset = thermalPreheat ? Math.min(18, Math.abs(Math.min(ambientTemp, 0)) * 0.5) : 0;
  const effectiveAmbient = ambientTemp + preheatOffset;

  // Internal temperature = ambient + self-heating from electrical load, made worse
  // by thin air removing that heat less effectively (lower effectiveDensity -> hotter).
  const internalTemp = effectiveAmbient + (Math.pow(loadCurrent, 1.2) * 0.35) / Math.sqrt(Math.max(effectiveDensity, 0.05));

  // Dielectric margin: how much safety buffer exists before air becomes too weak
  // an insulator and a spark can jump (Paschen's Law). Coating helps; humidity hurts.
  const coatingBonus = conformalCoating ? 9 : 0;
  const humidityPenalty = (humidity / 100) * 6;
  const dielectricMargin = (pressure / (1.0 + loadCurrent / 10.0)) + coatingBonus - humidityPenalty;

  // Extra risk specifically from deep cold below -25°C (battery chemistry, solder fatigue).
  const coldStressIndex = effectiveAmbient < -25 ? (-25 - effectiveAmbient) * 2.2 : 0;

  let status = 'NORMAL';
  let riskScore = 3.2 + coldStressIndex * 0.3;
  let actionTaken = 'Standard environmental protection active. No intervention required.';
  let precautionRec = 'System within operational envelope. Routine pre-flight dielectric checks recommended.';

  if (internalTemp > thresholds.tempCritical || dielectricMargin < thresholds.dielectricCritical || effectiveAmbient < -30 || vibration > 4.4) {
    status = 'CRITICAL';
    riskScore = Math.min(99, 88 + coldStressIndex);
    actionTaken = 'Auxiliary cooling to 100%, non-essential load shed 50%, flight envelope restricted.';
    precautionRec = 'High failure risk — prepare hardware for immediate mission drop or emergency landing.';
  } else if (internalTemp > thresholds.tempWarning || dielectricMargin < thresholds.dielectricWarning || vibration > 3.6 || coldStressIndex > 8) {
    status = 'WARNING';
    riskScore = Math.min(85, 52 + coldStressIndex);
    actionTaken = 'Substrate pre-heaters engaged, voltage-frequency scaling adjusted.';
    precautionRec = 'Monitor dielectric sparkover gap; restrict continuous full-throttle output.';
  }

  // Remaining Useful Life: a rough estimate (hours) of safe operating time left,
  // derived from the current risk score, boosted if protective hardware is enabled.
  const rulHours = Math.max(0.5, Math.round((100 - riskScore) * 2.4 * (conformalCoating ? 1.15 : 1) * (pressurizedEnclosure ? 1.2 : 1)) / 10) * 10;

  return { status, riskScore, internalTemp, dielectricMargin, pressure, coldStressIndex, rulHours, actionTaken, precautionRec };
};

const DEFAULT_THRESHOLDS = { tempWarning: 85, tempCritical: 105, dielectricWarning: 30, dielectricCritical: 18 };

// Sample equipment fleet — matches the equipment types the official problem statement
// names directly: UAVs/drones, radar systems, and military communication relays.
const FLEET_SEED = [
  { id: 'UAV-8849', label: 'Surveillance Drone', sector: 'Siachen Glacier', lat: 35.42, lon: 77.11, altitude: 5200, ambientTemp: -22, loadCurrent: 34, vibration: 2.4, humidity: 28 },
  { id: 'RDR-3312', label: 'Radar Station', sector: 'Kargil Ridge', lat: 34.55, lon: 76.13, altitude: 4600, ambientTemp: -14, loadCurrent: 41, vibration: 1.1, humidity: 35 },
  { id: 'COM-1207', label: 'Comms Relay Tower', sector: 'Khardung La Pass', lat: 34.28, lon: 77.60, altitude: 5359, ambientTemp: -28, loadCurrent: 18, vibration: 0.6, humidity: 22 },
];

const COLORS = {
  nominal: '#5FCBA0', warning: '#F2A93B', critical: '#E1544B',
  glacier: '#4FA8D6', glacierBright: '#7DD3F7', frost: '#DCEEF6', dim: '#5E7887',
};

const statusColor = (s) => s === 'CRITICAL' ? COLORS.critical : s === 'WARNING' ? COLORS.warning : COLORS.nominal;

const gridRef = (lat, lon) => {
  const band = String.fromCharCode(65 + Math.floor((lat + 90) % 26));
  const easting = Math.floor((lon % 1) * 99999).toString().padStart(5, '0');
  const northing = Math.floor((lat % 1) * 99999).toString().padStart(5, '0');
  return `43R ${band}${band} ${easting} ${northing}`;
};

/* ============================================================
   SMALL HELPER — hover tooltip using the browser's native title
   attribute. Zero extra dependencies, works everywhere.
============================================================ */
function InfoTip({ text }) {
  return (
    <span title={text} className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[#4A6373] text-[#8FA9B8] cursor-help ml-1 shrink-0">
      <Info size={9} />
    </span>
  );
}

/* ============================================================
   GEOMETRY HELPERS — radial instrument gauges
============================================================ */
const polar = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};
const arcPath = (cx, cy, r, a0, a1) => {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a0);
  const large = a1 - a0 <= 180 ? '0' : '1';
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
};

const START_ANGLE = -135, END_ANGLE = 135;

function RadialGauge({ value, min, max, label, unit, warnAt, critAt, invert = false, size = 128, note }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 16;
  const clamped = Math.max(min, Math.min(max, value));
  const frac = (clamped - min) / (max - min);
  const valueAngle = START_ANGLE + frac * (END_ANGLE - START_ANGLE);
  const overflow = value > max || value < min;

  const bad = invert ? value <= critAt : value >= critAt;
  const mid = invert ? value <= warnAt : value >= warnAt;
  const color = bad ? COLORS.critical : mid ? COLORS.warning : COLORS.glacierBright;

  const ticks = Array.from({ length: 11 }, (_, i) => START_ANGLE + (i / 10) * (END_ANGLE - START_ANGLE));

  const displayValue = Math.abs(clamped) >= 100 ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  const valueStr = `${displayValue}${overflow ? '+' : ''}`;
  const fontSize = Math.max(12, Math.min(20, size * 0.155));
  const unitFontSize = Math.max(7, size * 0.062);
  const maxTextWidth = r * 1.35;

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ maxWidth: size + 40 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={arcPath(cx, cy, r, START_ANGLE, END_ANGLE)} fill="none" stroke="rgba(223,240,247,0.08)" strokeWidth="6" strokeLinecap="round" />
        {ticks.map((a, i) => {
          const p1 = polar(cx, cy, r + 9, a);
          const p2 = polar(cx, cy, r + 3, a);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(223,240,247,0.25)" strokeWidth="1.5" />;
        })}
        <path d={arcPath(cx, cy, r, START_ANGLE, valueAngle)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}90)`, transition: 'all 0.6s ease' }} />
        <line x1={cx} y1={cy} x2={polar(cx, cy, r - 14, valueAngle).x} y2={polar(cx, cy, r - 14, valueAngle).y}
          stroke={color} strokeWidth="2" style={{ transition: 'all 0.6s ease' }} />
        <circle cx={cx} cy={cy} r="3" fill={color} />
        <text x={cx} y={cy + r * 0.5} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill={COLORS.frost}
          fontFamily="'JetBrains Mono', monospace" textLength={valueStr.length > 3 ? maxTextWidth : undefined} lengthAdjust="spacingAndGlyphs">
          {valueStr}
        </text>
        <text x={cx} y={cy + r * 0.5 + fontSize * 0.9} textAnchor="middle" fontSize={unitFontSize} fill={COLORS.dim} fontFamily="'JetBrains Mono', monospace">{unit}</text>
      </svg>
      <span className="text-[10px] tracking-wide text-[#8FA9B8] font-semibold text-center leading-tight" style={{ fontFamily: "'Oswald', sans-serif" }}>{label}</span>
      {note && <span className="text-[9px] text-[#4A6373] text-center leading-snug">{note}</span>}
    </div>
  );
}

/* ============================================================
   TERRAIN HERO — elevation strip with live equipment positions
============================================================ */
function TerrainHero({ fleet, models, selectedId, onSelect, clock }) {
  const W = 1200, H = 150;
  const peakPath = `M0,${H} L0,88 C120,40 180,95 260,60 C340,25 400,70 480,50 C560,30 620,78 700,55 C780,32 840,66 920,48 C1000,30 1060,58 1120,40 C1160,28 1180,45 ${W},35 L${W},${H} Z`;
  const contours = [0.72, 0.58, 0.44].map((f) => {
    return `M0,${H * f} C150,${H * f - 18} 300,${H * f + 14} 450,${H * f - 8} C600,${H * f - 24} 750,${H * f + 10} 900,${H * f - 6} C1020,${H * f - 16} 1100,${H * f + 8} ${W},${H * f - 4}`;
  });

  const minAlt = Math.min(...fleet.map(u => u.altitude));
  const maxAlt = Math.max(...fleet.map(u => u.altitude));

  return (
    <div className="relative w-full overflow-hidden border-b border-[#1B2A34]" style={{ background: 'linear-gradient(180deg, #060B10 0%, #0A141B 100%)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="none" className="block">
        <defs>
          <linearGradient id="peakFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12313F" />
            <stop offset="100%" stopColor="#060B10" />
          </linearGradient>
        </defs>
        <path d={peakPath} fill="url(#peakFill)" stroke="#2C5A6E" strokeWidth="1" />
        {contours.map((c, i) => (
          <path key={i} d={c} fill="none" stroke="#3E7A93" strokeWidth="1" opacity={0.18 + i * 0.08} />
        ))}
        {fleet.map((u, i) => {
          const x = 90 + i * ((W - 320) / Math.max(1, fleet.length - 1));
          const altFrac = (u.altitude - minAlt) / Math.max(1, maxAlt - minAlt);
          const y = 95 - altFrac * 55;
          const c = statusColor(models[u.id]?.status || 'NORMAL');
          const isSel = selectedId === u.id;
          return (
            <g key={u.id} className="cursor-pointer" onClick={() => onSelect(u.id)}>
              <line x1={x} y1={y} x2={x} y2={H - 4} stroke={c} strokeWidth="1" strokeDasharray="2,3" opacity="0.5" />
              <circle cx={x} cy={y} r={isSel ? 7 : 5} fill="#060B10" stroke={c} strokeWidth="2" style={{ filter: `drop-shadow(0 0 6px ${c}aa)` }} />
              {isSel && <circle cx={x} cy={y} r="12" fill="none" stroke={c} strokeWidth="1" opacity="0.5" />}
              <text x={x} y={y - 12} textAnchor="middle" fontSize="10" fontWeight="700" fill={COLORS.frost} fontFamily="'JetBrains Mono', monospace">{u.id}</text>
              <text x={x} y={H - 8} textAnchor="middle" fontSize="8.5" fill={COLORS.dim} fontFamily="'JetBrains Mono', monospace">{u.altitude}m</text>
            </g>
          );
        })}
      </svg>

      <div className="absolute top-3 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div className="flex items-center gap-2 text-[#7DD3F7]">
          <Mountain size={16} />
          <span className="text-xs font-bold tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>LADAKH HAA / SHAA REGION</span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[#5E7887] font-mono">LOCAL TIME (IST)</div>
          <div className="text-sm font-bold text-[#DCEEF6] font-mono">{clock}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN CONSOLE
============================================================ */
const NAV = [
  { key: 'fleet', label: 'Equipment', icon: MapPinned },
  { key: 'telemetry', label: 'Live Readings', icon: Wifi },
  { key: 'analysis', label: 'Risk Analysis', icon: Activity },
  { key: 'actions', label: 'Protection', icon: ShieldCheck },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'settings', label: 'Settings', icon: Settings2 },
  { key: 'glossary', label: 'Glossary', icon: BookOpen },
];

export default function PhaseConsole() {
  const [activeTab, setActiveTab] = useState('fleet');
  const [fleet, setFleet] = useState(FLEET_SEED);
  const [selectedId, setSelectedId] = useState(FLEET_SEED[0].id);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState('14:32:05');
  const [manualOverride, setManualOverride] = useState(false);
  const [heatingPad, setHeatingPad] = useState(true);
  const [fanSpeed, setFanSpeed] = useState('AUTO');
  const [loadShedding, setLoadShedding] = useState(false);
  const [mitigations, setMitigations] = useState({ conformalCoating: true, pressurizedEnclosure: false, thermalPreheat: true });
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [telemetryStream, setTelemetryStream] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [clock, setClock] = useState('');
  const prevStatusRef = useRef({});

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const selected = fleet.find(u => u.id === selectedId) || fleet[0];
  const updateSelected = (field, value) => setFleet(prev => prev.map(u => u.id === selectedId ? { ...u, [field]: Number(value) } : u));

  const model = useMemo(() => computeReliabilityModel(selected, mitigations, thresholds), [selected, mitigations, thresholds]);
  const allModels = useMemo(() => Object.fromEntries(fleet.map(u => [u.id, computeReliabilityModel(u, mitigations, thresholds)])), [fleet, mitigations, thresholds]);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextTime = new Date().toLocaleTimeString('en-GB', { hour12: false });
      setTelemetryStream(prev => {
        const existing = prev[selectedId] || [];
        const updated = [...existing, {
          time: nextTime,
          internalTemp: Math.round(model.internalTemp),
          dielectricMargin: Math.round(model.dielectricMargin),
          riskScore: Math.round(model.riskScore),
        }].slice(-18);
        return { ...prev, [selectedId]: updated };
      });
      const prevStatus = prevStatusRef.current[selectedId];
      if (prevStatus !== model.status && (model.status === 'WARNING' || model.status === 'CRITICAL')) {
        setAlerts(prev => [{
          id: `${selectedId}-${Date.now()}`, time: nextTime, unit: selectedId, unitLabel: selected.label,
          severity: model.status,
          message: `${model.status === 'CRITICAL' ? 'Critical envelope breach' : 'Warning threshold crossed'} on ${selected.label} — ${selectedId}. ${model.actionTaken}`,
          acknowledged: false,
        }, ...prev].slice(0, 40));
      }
      prevStatusRef.current[selectedId] = model.status;
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedId, model, selected]);

  const handleForceSync = () => {
    setIsSyncing(true);
    setTimeout(() => { setLastSyncTime(new Date().toLocaleTimeString('en-GB', { hour12: false })); setIsSyncing(false); }, 1100);
  };
  const acknowledgeAlert = (id) => setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  const exportCSV = () => {
    const rows = telemetryStream[selectedId] || [];
    if (rows.length === 0) return;
    const header = 'time,internalTemp,dielectricMargin,riskScore';
    const body = rows.map(r => `${r.time},${r.internalTemp},${r.dielectricMargin},${r.riskScore}`).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${selectedId}_log.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const unackCount = alerts.filter(a => !a.acknowledged).length;
  const sColor = statusColor(model.status);

  return (
    <div className="min-h-screen flex" style={{ background: '#080D12', fontFamily: "'JetBrains Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        .notch { clip-path: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%); }
        .notch-sm { clip-path: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%); }
        input[type=range] { -webkit-appearance: none; height: 3px; background: #1B2A34; border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #7DD3F7; box-shadow: 0 0 6px #7DD3F7aa; cursor: pointer; margin-top: -5px; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-thumb { background: #1B2A34; border-radius: 3px; }
      `}</style>

      {/* SIDEBAR RAIL */}
      <aside className="w-[80px] shrink-0 border-r border-[#1B2A34] flex flex-col items-center py-5 gap-1" style={{ background: '#0A1017' }}>
        <div className="mb-2 p-2 rounded-full border border-[#2C5A6E]" style={{ boxShadow: '0 0 10px #4FA8D640' }}>
          <Radio size={18} className="text-[#7DD3F7]" />
        </div>
        <div className="mb-4 text-center">
          <div className="text-[10px] font-bold text-[#7DD3F7]" style={{ fontFamily: "'Oswald', sans-serif" }}>PHASE</div>
          <div className="text-[6px] text-[#4A6373] leading-tight px-1">Predictive<br/>Env. Health</div>
        </div>
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className="relative w-full flex flex-col items-center gap-1 py-3 group"
          >
            {activeTab === key && <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#7DD3F7] rounded-r" style={{ boxShadow: '0 0 8px #7DD3F7' }} />}
            <Icon size={17} className={activeTab === key ? 'text-[#7DD3F7]' : 'text-[#4A6373] group-hover:text-[#8FA9B8]'} />
            <span className={`text-[8.5px] font-semibold tracking-wide text-center leading-tight ${activeTab === key ? 'text-[#7DD3F7]' : 'text-[#4A6373]'}`} style={{ fontFamily: "'Oswald', sans-serif" }}>{label}</span>
            {key === 'alerts' && unackCount > 0 && (
              <span className="absolute top-1.5 right-3.5 bg-[#E1544B] text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">{unackCount}</span>
            )}
          </button>
        ))}
        <div className="mt-auto">
          <button onClick={() => setManualOverride(!manualOverride)}
            className={`w-11 h-11 rounded-full border flex items-center justify-center transition ${manualOverride ? 'border-[#E1544B] bg-[#E1544B]/10' : 'border-[#2C5A6E]'}`}
            title="Switch between AI control and manual human control of the heater, fan, and load-shedding">
            <ShieldAlertMini active={manualOverride} />
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex-1 min-w-0">
        <TerrainHero fleet={fleet} models={allModels} selectedId={selectedId} onSelect={setSelectedId} clock={clock} />

        {/* explanatory banner */}
        <div className="px-6 py-2 text-[10px] text-[#8FA9B8] border-b border-[#1B2A34] flex items-center gap-2" style={{ background: '#0A1017' }}>
          <Info size={11} className="text-[#7DD3F7] shrink-0" />
          <span>All values on this screen are <b className="text-[#7DD3F7]">calculated from physics formulas</b>, driven by the sliders on the Live Readings tab — not live sensor hardware. See the <b>Glossary</b> tab for what every term means and how each number is worked out.</span>
        </div>

        {/* status strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-[#1B2A34]" style={{ background: '#0A1017' }}>
          <div className="flex items-center gap-5 text-xs">
            <div>
              <span className="text-[#4A6373] block text-[9px] flex items-center">Location Code <InfoTip text="A simplified placeholder location code for this demo — not a real military grid reference." /></span>
              <span className="text-[#DCEEF6] font-semibold">{gridRef(selected.lat, selected.lon)}</span>
            </div>
            <div>
              <span className="text-[#4A6373] block text-[9px]">Region</span>
              <span className="text-[#DCEEF6] font-semibold">{selected.sector}</span>
            </div>
            <div>
              <span className="text-[#4A6373] block text-[9px]">Last Updated</span>
              <span className="text-[#DCEEF6] font-semibold">{lastSyncTime} IST</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleForceSync} disabled={isSyncing} className="p-2 rounded-full border border-[#1B2A34] hover:border-[#4FA8D6] transition" title="Refresh readings">
              <RefreshCw size={14} className={isSyncing ? 'animate-spin text-[#7DD3F7]' : 'text-[#8FA9B8]'} />
            </button>
            <div className="notch-sm px-3 py-1.5 text-[11px] font-bold flex items-center gap-2" style={{ background: `${sColor}18`, border: `1px solid ${sColor}55`, color: sColor }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sColor, boxShadow: `0 0 6px ${sColor}` }} />
              {model.status}
            </div>
          </div>
        </div>

        {/* unit chips */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b border-[#1B2A34] overflow-x-auto" style={{ background: '#080D12' }}>
          {fleet.map(u => {
            const c = statusColor(allModels[u.id]?.status);
            const isSel = selectedId === u.id;
            return (
              <button key={u.id} onClick={() => setSelectedId(u.id)}
                className={`notch-sm flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition ${isSel ? '' : 'opacity-60 hover:opacity-100'}`}
                style={{ background: isSel ? `${c}15` : '#0D141B', border: `1px solid ${isSel ? c + '70' : '#1B2A34'}`, color: isSel ? COLORS.frost : COLORS.dim }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                {u.id} <span className="text-[#4A6373] font-normal">· {u.label}</span>
              </button>
            );
          })}
        </div>

        <main className="p-6 space-y-6 max-w-6xl">

          {activeTab === 'fleet' && (
            <div className="space-y-6">
              <p className="text-xs text-[#5E7887] max-w-2xl">Three example units, representing the equipment types named directly in the official problem statement — a drone, a radar station, and a communications relay — all operating in Ladakh's High Altitude Areas (HAA) / Super High Altitude Areas (SHAA). Click any card to see its live readings.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {fleet.map(u => {
                  const m = allModels[u.id];
                  const c = statusColor(m.status);
                  return (
                    <button key={u.id} onClick={() => { setSelectedId(u.id); setActiveTab('telemetry'); }}
                      className="notch text-left p-5 space-y-3 transition hover:translate-y-[-2px]"
                      style={{ background: '#0D141B', border: `1px solid ${c}40` }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-[#DCEEF6]" style={{ fontFamily: "'Oswald', sans-serif" }}>{u.label}</h3>
                          <p className="text-[10px] text-[#4A6373]">{u.id} · {u.sector}</p>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 notch-sm" style={{ background: `${c}20`, color: c, border: `1px solid ${c}50` }}>{m.status}</span>
                      </div>
                      <div className="flex justify-center gap-1 pt-1 -mx-2">
                        <RadialGauge value={m.internalTemp} min={-40} max={120} label="Core Temp (°C)" unit="°C" warnAt={thresholds.tempWarning} critAt={thresholds.tempCritical} size={100} />
                        <RadialGauge value={m.riskScore} min={0} max={100} label="Risk Score (%)" unit="%" warnAt={50} critAt={85} size={100} />
                        <RadialGauge value={m.rulHours} min={0} max={240} label="Life Left (hrs)" unit="h" warnAt={48} critAt={12} invert size={100} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              <div className="notch p-5 flex flex-wrap items-center justify-between gap-4" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <div className="flex items-center gap-3">
                  <Wifi size={18} className="text-[#5FCBA0]" />
                  <div>
                    <h2 className="text-sm font-bold text-[#DCEEF6]" style={{ fontFamily: "'Oswald', sans-serif" }}>{selected.label} — {selected.id}</h2>
                    <p className="text-[11px] text-[#5E7887]">{selected.sector} · move the sliders below to simulate different conditions</p>
                  </div>
                </div>
                <button onClick={exportCSV} className="notch-sm flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold" style={{ background: '#0A1017', border: '1px solid #2C5A6E', color: '#8FA9B8' }}>
                  <Download size={13} /> Export CSV
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 notch p-5 space-y-5" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#7DD3F7] tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>SIMULATED SENSOR INPUT</h3>
                  <RangeField label="Altitude" note="Height above sea level. Higher = thinner air = worse cooling & weaker insulation." unit="m" min={500} max={6500} value={selected.altitude} onChange={v => updateSelected('altitude', v)} />
                  <RangeField label="Ambient Temperature" note="The outside air temperature around the equipment." unit="°C" min={-40} max={30} value={selected.ambientTemp} onChange={v => updateSelected('ambientTemp', v)} />
                  <RangeField label="Electrical Load" note="How hard the equipment's electronics are working (higher = more self-generated heat)." unit="A (Amps)" min={2} max={50} value={selected.loadCurrent} onChange={v => updateSelected('loadCurrent', v)} />
                  <RangeField label="Vibration" note="Shaking/movement, measured in G-force (1G = normal gravity)." unit="G" min={0.1} max={5.0} step={0.1} value={selected.vibration} onChange={v => updateSelected('vibration', v)} />
                  <RangeField label="Humidity" note="Moisture in the air — higher humidity slightly weakens the insulation margin too." unit="%" min={5} max={95} value={selected.humidity} onChange={v => updateSelected('humidity', v)} />
                </div>

                <div className="lg:col-span-3 notch p-5 flex flex-col items-center justify-center gap-6" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <RadialGauge value={model.internalTemp} min={-40} max={120} label="Core Temp (°C)" unit="°C" warnAt={thresholds.tempWarning} critAt={thresholds.tempCritical} size={130}
                    note="Estimated inside-the-casing temperature" />
                  <RadialGauge value={model.dielectricMargin} min={0} max={100} label="Insulation Margin" unit="pts" warnAt={thresholds.dielectricWarning} critAt={thresholds.dielectricCritical} invert size={130}
                    note="Buffer before air gets too thin to stop a spark" />
                </div>

                <div className="lg:col-span-5 notch p-5 space-y-3" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#8FA9B8] tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>READINGS OVER TIME</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={telemetryStream[selectedId] || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1B2A34" />
                        <XAxis dataKey="time" stroke="#4A6373" style={{ fontSize: '9px' }} />
                        <YAxis stroke="#4A6373" style={{ fontSize: '9px' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#0A1017', borderColor: '#2C5A6E', fontSize: '11px' }} />
                        <Line type="monotone" dataKey="internalTemp" stroke="#E1544B" name="Core Temp °C" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="dielectricMargin" stroke="#7DD3F7" name="Insulation Margin" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="space-y-6">
              <div className="notch p-6 flex flex-wrap justify-center gap-6" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <RadialGauge value={model.pressure} min={40} max={101} label="Air Pressure" unit="kPa" warnAt={70} critAt={55} invert note="kPa = kilopascals. Sea level ≈ 101 kPa." />
                <RadialGauge value={model.internalTemp} min={-40} max={120} label="Core Temp (°C)" unit="°C" warnAt={thresholds.tempWarning} critAt={thresholds.tempCritical} />
                <RadialGauge value={model.dielectricMargin} min={0} max={100} label="Insulation Margin" unit="pts" warnAt={thresholds.dielectricWarning} critAt={thresholds.dielectricCritical} invert />
                <RadialGauge value={model.riskScore} min={0} max={100} label="Risk Score" unit="%" warnAt={50} critAt={85} />
                <RadialGauge value={model.rulHours} min={0} max={240} label="Remaining Useful Life" unit="h" warnAt={48} critAt={12} invert note="Estimated safe hours left" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="notch p-6 space-y-4" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#8FA9B8] tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>WHAT DRIVES THE RISK SCORE MOST</h3>
                  <p className="text-[10px] text-[#5E7887]">These weights show roughly how much each factor contributes to the overall Risk Score above.</p>
                  <div className="space-y-3">
                    {[
                      { name: 'Insulation Margin (spark risk)', w: 0.30 }, { name: 'Core Temperature', w: 0.26 },
                      { name: 'Extreme-Cold Stress', w: 0.17 }, { name: 'Altitude', w: 0.13 },
                      { name: 'Humidity', w: 0.09 }, { name: 'Vibration', w: 0.05 },
                    ].map(f => (
                      <div key={f.name}>
                        <div className="flex justify-between text-[10px] text-[#8FA9B8] mb-1"><span>{f.name}</span><span>{(f.w * 100).toFixed(0)}%</span></div>
                        <div className="h-1.5 rounded-full bg-[#1B2A34] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${f.w * 100}%`, background: 'linear-gradient(90deg,#4FA8D6,#7DD3F7)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="notch p-6 space-y-3" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#8FA9B8] tracking-wide" style={{ fontFamily: "'Oswald', sans-serif" }}>RISK SCORE OVER TIME</h3>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={telemetryStream[selectedId] || []}>
                        <defs>
                          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#E1544B" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="#E1544B" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1B2A34" />
                        <XAxis dataKey="time" stroke="#4A6373" style={{ fontSize: '9px' }} />
                        <YAxis stroke="#4A6373" style={{ fontSize: '9px' }} domain={[0, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: '#0A1017', borderColor: '#2C5A6E', fontSize: '11px' }} />
                        <Area type="monotone" dataKey="riskScore" stroke="#E1544B" fill="url(#riskFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="notch p-5 space-y-3" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#7DD3F7] tracking-wide flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}><ShieldCheck size={14} /> AUTOMATIC ACTION TAKEN <InfoTip text="This is a rule: IF a limit is crossed, THEN this action happens automatically. The AI's job is prediction; this fixed rule is what actually executes." /></h3>
                  <p className="text-xs text-[#B7CCD6] bg-[#0A1017] p-4 rounded border border-[#1B2A34] leading-relaxed">{model.actionTaken}</p>
                </div>
                <div className="notch p-5 space-y-3" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                  <h3 className="text-[11px] font-bold text-[#F2A93B] tracking-wide flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}><AlertTriangle size={14} /> RECOMMENDATION FOR OPERATOR</h3>
                  <p className="text-xs text-[#B7CCD6] bg-[#0A1017] p-4 rounded border border-[#1B2A34] leading-relaxed">{model.precautionRec}</p>
                </div>
              </div>

              <div className="notch p-6 space-y-4" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <h3 className="text-sm font-bold text-[#DCEEF6]" style={{ fontFamily: "'Oswald', sans-serif" }}>Hardware Upgrade Options</h3>
                <p className="text-xs text-[#5E7887]">Toggle these candidate hardware add-ons to see their modeled effect on reliability. None of these are new inventions — they're existing techniques we're combining and testing.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <MitigationToggle icon={Layers} label="Conformal Coating" desc="A thin protective varnish painted onto circuit boards. Repels moisture and raises the voltage needed for a spark to jump between components." active={mitigations.conformalCoating} onToggle={() => setMitigations(m => ({ ...m, conformalCoating: !m.conformalCoating }))} />
                  <MitigationToggle icon={Gauge} label="Pressurized Enclosure" desc="A sealed box that keeps the air inside closer to sea-level pressure, partly restoring normal cooling and insulation even at high altitude." active={mitigations.pressurizedEnclosure} onToggle={() => setMitigations(m => ({ ...m, pressurizedEnclosure: !m.pressurizedEnclosure }))} />
                  <MitigationToggle icon={Flame} label="Thermal Pre-Heat" desc="Small heaters that warm key components before/during cold exposure, reducing cold-related battery and solder stress." active={mitigations.thermalPreheat} onToggle={() => setMitigations(m => ({ ...m, thermalPreheat: !m.thermalPreheat }))} />
                </div>
              </div>

              <div className="notch p-6 space-y-4" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <div className="flex justify-between items-center border-b border-[#1B2A34] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#DCEEF6]" style={{ fontFamily: "'Oswald', sans-serif" }}>Manual Override Switch</h3>
                    <p className="text-[11px] text-[#5E7887]">Lets a human operator take direct control of the heater, fan, and load-shedding instead of the automatic rules. This is the same "safety layer can always override the system" idea from our design.</p>
                  </div>
                  <span className="notch-sm text-[10px] font-bold px-3 py-1" style={{ background: manualOverride ? '#E1544B25' : '#1B2A34', color: manualOverride ? '#E1544B' : '#5E7887' }}>
                    {manualOverride ? 'MANUAL CONTROL ON' : 'AUTOMATIC (LOCKED)'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InterlockCard label="Heater" enabled={manualOverride} active={heatingPad} onToggle={() => setHeatingPad(!heatingPad)} onLabel="ON" offLabel="OFF" />
                  <InterlockCard label="Cooling Fan" enabled={manualOverride} active={fanSpeed === 'MAX'} onToggle={() => setFanSpeed(fanSpeed === 'MAX' ? 'AUTO' : 'MAX')} onLabel={`FAN: ${fanSpeed}`} offLabel={`FAN: ${fanSpeed}`} neutral />
                  <InterlockCard label="Load Shedding" enabled={manualOverride} active={loadShedding} onToggle={() => setLoadShedding(!loadShedding)} onLabel="50% REDUCED" offLabel="NORMAL" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="notch p-5 flex items-center justify-between" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <div className="flex items-center gap-3">
                  <Bell size={18} className="text-[#7DD3F7]" />
                  <div>
                    <h2 className="text-sm font-bold text-[#DCEEF6]" style={{ fontFamily: "'Oswald', sans-serif" }}>Alert History</h2>
                    <p className="text-[11px] text-[#5E7887]">Created automatically whenever a Warning or Critical limit is crossed.</p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#8FA9B8]">{unackCount} unread</span>
              </div>
              <div className="notch divide-y divide-[#1B2A34] overflow-hidden" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                {alerts.length === 0 && <div className="p-8 text-center text-xs text-[#4A6373]">No alerts yet — everything is within normal limits.</div>}
                {alerts.map(a => {
                  const c = statusColor(a.severity);
                  return (
                    <div key={a.id} className={`p-4 flex items-start justify-between gap-4 ${a.acknowledged ? 'opacity-40' : ''}`}>
                      <div className="flex items-start gap-3">
                        {a.severity === 'CRITICAL' ? <XCircle size={15} style={{ color: c }} className="mt-0.5" /> : <AlertTriangle size={15} style={{ color: c }} className="mt-0.5" />}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold px-2 py-0.5 notch-sm" style={{ background: `${c}20`, color: c, border: `1px solid ${c}50` }}>{a.severity}</span>
                            <span className="text-[10px] text-[#4A6373]">{a.time} · {a.unit}</span>
                          </div>
                          <p className="text-xs text-[#B7CCD6] leading-relaxed">{a.message}</p>
                        </div>
                      </div>
                      {!a.acknowledged && (
                        <button onClick={() => acknowledgeAlert(a.id)} className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 whitespace-nowrap notch-sm" style={{ background: '#0A1017', border: '1px solid #2C5A6E', color: '#8FA9B8' }}>
                          <CheckCircle2 size={12} /> MARK READ
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="notch p-6 space-y-5" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <h3 className="text-sm font-bold text-[#DCEEF6] flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}><Settings2 size={16} className="text-[#7DD3F7]" /> Alert Threshold Settings</h3>
                <p className="text-xs text-[#5E7887]">Change the exact values at which a Warning or Critical alert should trigger.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <ThresholdField label="Core Temp — Warning level (°C)" value={thresholds.tempWarning} onChange={v => setThresholds(t => ({ ...t, tempWarning: v }))} />
                  <ThresholdField label="Core Temp — Critical level (°C)" value={thresholds.tempCritical} onChange={v => setThresholds(t => ({ ...t, tempCritical: v }))} />
                  <ThresholdField label="Insulation Margin — Warning level" value={thresholds.dielectricWarning} onChange={v => setThresholds(t => ({ ...t, dielectricWarning: v }))} />
                  <ThresholdField label="Insulation Margin — Critical level" value={thresholds.dielectricCritical} onChange={v => setThresholds(t => ({ ...t, dielectricCritical: v }))} />
                </div>
                <p className="text-[10px] text-[#4A6373]">Note: "Insulation Margin" is a modelled index (arbitrary points), not a physical unit — it's a simplified stand-in for the real dielectric-breakdown physics described in the Glossary.</p>
                <button onClick={() => setThresholds(DEFAULT_THRESHOLDS)} className="text-[11px] font-bold text-[#5E7887] hover:text-[#DCEEF6] underline underline-offset-2">Reset to default values</button>
              </div>
              <div className="notch p-6 space-y-3" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <h3 className="text-sm font-bold text-[#DCEEF6] flex items-center gap-2" style={{ fontFamily: "'Oswald', sans-serif" }}><Compass size={16} className="text-[#5FCBA0]" /> About Ladakh's Environment</h3>
                <p className="text-xs text-[#B7CCD6] leading-relaxed">HAA (High Altitude Areas) and SHAA (Super High Altitude Areas) in Ladakh typically span 3,500–5,800 metres, with ambient temperatures down to -40°C and air density as low as 55–60% of sea level — reducing cooling effectiveness and lowering the voltage needed for electrical arcing (Paschen's Law).</p>
              </div>
            </div>
          )}

          {activeTab === 'glossary' && (
            <div className="space-y-4 max-w-3xl">
              <div className="notch p-5" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
                <h2 className="text-sm font-bold text-[#DCEEF6] mb-1" style={{ fontFamily: "'Oswald', sans-serif" }}>Glossary — every term and number explained</h2>
                <p className="text-xs text-[#5E7887]">Everything below is written in plain language so anyone unfamiliar with the acronyms can follow the dashboard.</p>
              </div>
              <GlossaryEntry term="HAA" full="High Altitude Areas" body="Regions roughly 3,000–5,500 metres above sea level — one of the two altitude bands named in the official problem statement." />
              <GlossaryEntry term="SHAA" full="Super High Altitude Areas" body="Regions above roughly 5,500 metres — even thinner air, colder temperatures, and lower oxygen than HAA." />
              <GlossaryEntry term="RUL" full="Remaining Useful Life" body="An estimate, in hours, of how much longer the equipment can keep operating safely before it's at high risk of failure. Calculated from the current Risk Score — the higher the risk, the fewer hours are left — with a bonus if protective hardware (coating, pressurized enclosure) is switched on." />
              <GlossaryEntry term="Risk Score" full="0–100 combined danger score" body="A single number combining core temperature, insulation margin, extreme-cold stress, altitude, humidity, and vibration into one score. Above the Warning limit → status turns WARNING; above the Critical limit → status turns CRITICAL." />
              <GlossaryEntry term="Core / Internal Temperature" full="Estimated inside-the-casing temperature" body="Not directly measured here — calculated as: outside air temperature + heat generated by the electronics' own electrical load, made worse because thin high-altitude air carries that heat away less effectively than sea-level air." />
              <GlossaryEntry term="Insulation Margin (Dielectric Margin)" full="Buffer against electrical sparking" body="Air is an electrical insulator, but low air pressure at altitude makes it a weaker one — a real, well-documented effect called Paschen's Law. This margin is a modelled score for how much buffer remains before a spark could jump between two conductors. A protective coating raises the margin; humidity lowers it." />
              <GlossaryEntry term="Cold Stress Index" full="Extra risk from deep cold" body="An additional risk contribution that only kicks in once temperature drops below -25°C, reflecting the extra strain on battery chemistry and solder joints in genuinely extreme cold." />
              <GlossaryEntry term="kPa" full="Kilopascals" body="A unit of air pressure. Sea level air pressure is about 101 kPa; at 5,000 m altitude it drops to roughly 54 kPa — just over half." />
              <GlossaryEntry term="G (G-force)" full="Unit of vibration / acceleration" body="1 G equals the normal pull of Earth's gravity. Used here to represent how much an equipment unit is shaking or being jolted." />
              <GlossaryEntry term="Manual Override" full="Human takes control from the automatic rules" body="Normally, fixed rules automatically decide when to turn the heater/fan on or shed load. Manual Override lets a human operator take direct control instead — this reflects the safety principle that automated logic should never be the only way to control the hardware." />
              <GlossaryEntry term="Everything is MODELLED, not MEASURED" full="Important honesty note" body="Every number in this console is calculated from the physics formulas above, run against slider values you set — not read from a real temperature/pressure sensor. This is a software prototype demonstrating the decision logic; wiring in real sensors is the next hardware phase." />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   PRESENTATIONAL HELPERS
============================================================ */
function ShieldAlertMini({ active }) {
  return <ChevronRight size={16} className={active ? 'text-[#E1544B] rotate-90 transition' : 'text-[#4A6373] transition'} />;
}

function RangeField({ label, note, unit, min, max, step = 1, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-[#8FA9B8]">{label}</span>
        <span className="font-bold text-[#7DD3F7]">{value} {unit}</span>
      </div>
      {note && <p className="text-[9px] text-[#4A6373] mb-1.5 leading-snug">{note}</p>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
    </div>
  );
}

function MitigationToggle({ icon: Icon, label, desc, active, onToggle }) {
  return (
    <button onClick={onToggle} className="notch-sm text-left p-4 transition" style={{ background: active ? '#4FA8D615' : '#0A1017', border: `1px solid ${active ? '#4FA8D670' : '#1B2A34'}` }}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={16} color={active ? '#7DD3F7' : '#4A6373'} />
        <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: active ? '#4FA8D625' : '#1B2A34', color: active ? '#7DD3F7' : '#5E7887' }}>{active ? 'ON' : 'OFF'}</span>
      </div>
      <h4 className="text-xs font-bold text-[#DCEEF6] mb-1">{label}</h4>
      <p className="text-[10px] text-[#5E7887] leading-relaxed">{desc}</p>
    </button>
  );
}

function InterlockCard({ label, enabled, active, onToggle, onLabel, offLabel, neutral }) {
  return (
    <div className="notch-sm p-4" style={{ background: enabled ? '#0D141B' : '#0A101740', border: `1px solid ${enabled ? '#2C5A6E' : '#1B2A34'}`, opacity: enabled ? 1 : 0.45 }}>
      <span className="text-[10px] font-bold text-[#8FA9B8] block mb-2">{label}</span>
      <button disabled={!enabled} onClick={onToggle} className="w-full py-2 text-[11px] font-bold notch-sm"
        style={{ background: neutral ? '#4FA8D625' : active ? '#5FCBA025' : '#1B2A34', color: neutral ? '#7DD3F7' : active ? '#5FCBA0' : '#8FA9B8' }}>
        {active ? onLabel : offLabel}
      </button>
    </div>
  );
}

function ThresholdField({ label, value, onChange }) {
  return (
    <div>
      <span className="text-xs text-[#8FA9B8] block mb-1.5">{label}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 text-sm text-[#DCEEF6] focus:outline-none notch-sm"
        style={{ background: '#0A1017', border: '1px solid #1B2A34' }} />
    </div>
  );
}

function GlossaryEntry({ term, full, body }) {
  return (
    <div className="notch-sm p-4" style={{ background: '#0D141B', border: '1px solid #1B2A34' }}>
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="text-sm font-bold text-[#7DD3F7]" style={{ fontFamily: "'Oswald', sans-serif" }}>{term}</span>
        <span className="text-[11px] text-[#4A6373]">— {full}</span>
      </div>
      <p className="text-xs text-[#B7CCD6] leading-relaxed">{body}</p>
    </div>
  );
}
