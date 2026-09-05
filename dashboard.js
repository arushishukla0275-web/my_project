import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertTriangle, ShieldCheck, Thermometer, Gauge, 
  Zap, Cpu, Sliders, Play, RotateCcw, FileText, Layers, ManualControl 
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, Cell 
} from 'recharts';

// --- Default Telemetry Generator (Emulating Model Inference) ---
const calculateHealthStatus = (altitude, temp, current, vibration) => {
  const pressure = 101.325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
  const airDensityRatio = pressure / 101.325;
  const internalTemp = temp + (Math.pow(current, 1.4) * 0.8) / Math.sqrt(airDensityRatio);
  const dielectricMargin = pressure / (1.0 + (current / 10.0));

  if (internalTemp > 105 || dielectricMargin < 18 || temp < -30) {
    return { status: 'CRITICAL', score: 2, internalTemp, dielectricMargin, pressure };
  }
  if (internalTemp > 85 || dielectricMargin < 30 || vibration > 3.8) {
    return { status: 'WARNING', score: 1, internalTemp, dielectricMargin, pressure };
  }
  return { status: 'OPTIMAL', score: 0, internalTemp, dielectricMargin, pressure };
};

export default function HighAltitudeDashboard() {
  const [activeTab, setActiveTab] = useState('operations');
  
  // Real-time Inputs
  const [altitude, setAltitude] = useState(4500);
  const [ambientTemp, setAmbientTemp] = useState(-15);
  const [loadCurrent, setLoadCurrent] = useState(28);
  const [vibration, setVibration] = useState(1.8);
  
  // Controls & Override State
  const [manualOverride, setManualOverride] = useState(false);
  const [heatingPad, setHeatingPad] = useState(true);
  const [fanSpeed, setFanSpeed] = useState('AUTO');
  const [loadShedding, setLoadShedding] = useState(false);

  // Computed Model State
  const modelOutput = calculateHealthStatus(altitude, ambientTemp, loadCurrent, vibration);

  // Time-Series Telemetry State
  const [telemetryHistory, setTelemetryHistory] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryHistory(prev => {
        const nextTime = new Date().toLocaleTimeString();
        const updated = [...prev, {
          time: nextTime,
          altitude: Number(altitude),
          internalTemp: Math.round(modelOutput.internalTemp),
          dielectricMargin: Math.round(modelOutput.dielectricMargin),
          pressure: Math.round(modelOutput.pressure)
        }];
        return updated.slice(-15); // Keep last 15 points
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [altitude, ambientTemp, loadCurrent, vibration, modelOutput]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600/20 border border-indigo-500/40 rounded-lg text-indigo-400">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">AERO-RELIABILITY AI</h1>
            <p className="text-xs text-slate-400">SIH26049 DRDO Mission Monitor | Sub-Zero & High-Altitude Systems</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab('operations')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab === 'operations' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Activity size={16} /> Mission Ops
          </button>
          <button 
            onClick={() => setActiveTab('explainability')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab === 'explainability' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Layers size={16} /> ML Studio & XAI
          </button>
          <button 
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition ${activeTab === 'explorer' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <FileText size={16} /> Data Explorer
          </button>
        </nav>

        {/* Dynamic Status Indicator */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border ${
            modelOutput.status === 'CRITICAL' ? 'bg-red-500/10 border-red-500/40 text-red-400 animate-pulse' :
            modelOutput.status === 'WARNING' ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' :
            'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              modelOutput.status === 'CRITICAL' ? 'bg-red-500' :
              modelOutput.status === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
            SYSTEM {modelOutput.status}
          </div>
        </div>
      </header>

      {/* Main Body View Switching */}
      <main className="p-6 max-w-7xl mx-auto">
        {activeTab === 'operations' && (
          <div className="space-y-6">
            {/* Realtime Simulation Controls & Metric Gauges */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Interactive Telemetry Inputs */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold flex items-center gap-2 text-indigo-400">
                  <Sliders size={18} /> Telemetry Simulation Injector
                </h2>
                
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Altitude</span>
                    <span className="font-mono text-indigo-300">{altitude} m</span>
                  </div>
                  <input type="range" min="500" max="6500" value={altitude} onChange={(e) => setAltitude(e.target.value)} className="w-full accent-indigo-500" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Ambient Temp</span>
                    <span className="font-mono text-indigo-300">{ambientTemp} °C</span>
                  </div>
                  <input type="range" min="-40" max="30" value={ambientTemp} onChange={(e) => setAmbientTemp(e.target.value)} className="w-full accent-indigo-500" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Load Current</span>
                    <span className="font-mono text-indigo-300">{loadCurrent} A</span>
                  </div>
                  <input type="range" min="2" max="50" value={loadCurrent} onChange={(e) => setLoadCurrent(e.target.value)} className="w-full accent-indigo-500" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Vibration Intensity</span>
                    <span className="font-mono text-indigo-300">{vibration} G</span>
                  </div>
                  <input type="range" min="0.1" max="5.0" step="0.1" value={vibration} onChange={(e) => setVibration(e.target.value)} className="w-full accent-indigo-500" />
                </div>
              </div>

              {/* Status Gauges */}
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5"><Gauge size={14}/> Ambient Pressure</span>
                  <div className="my-2">
                    <span className="text-2xl font-bold font-mono">{modelOutput.pressure.toFixed(1)}</span>
                    <span className="text-xs text-slate-500 ml-1">kPa</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Std: 101.3 kPa at Sea Level</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5"><Thermometer size={14}/> Est. Internal Temp</span>
                  <div className="my-2">
                    <span className={`text-2xl font-bold font-mono ${modelOutput.internalTemp > 85 ? 'text-red-400' : 'text-slate-100'}`}>
                      {modelOutput.internalTemp.toFixed(1)}°C
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Limit: 85°C (Warn) / 105°C (Crit)</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5"><Zap size={14}/> Dielectric Margin</span>
                  <div className="my-2">
                    <span className={`text-2xl font-bold font-mono ${modelOutput.dielectricMargin < 30 ? 'text-amber-400' : 'text-slate-100'}`}>
                      {modelOutput.dielectricMargin.toFixed(1)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Paschen Arc Safety Scale</span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5"><ShieldCheck size={14}/> ML Failure Risk</span>
                  <div className="my-2">
                    <span className="text-2xl font-bold font-mono">
                      {modelOutput.score === 2 ? '89.4%' : modelOutput.score === 1 ? '48.2%' : '4.1%'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">Confidence Score</span>
                </div>
              </div>
            </div>

            {/* Time Series Streaming Charts */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 text-slate-300">Real-Time Sensor Telemetry Stream</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={telemetryHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                    <Legend />
                    <Line type="monotone" dataKey="internalTemp" stroke="#f43f5e" name="Internal Temp (°C)" strokeWidth={2} />
                    <Line type="monotone" dataKey="dielectricMargin" stroke="#38bdf8" name="Dielectric Margin" strokeWidth={2} />
                    <Line type="monotone" dataKey="pressure" stroke="#a855f7" name="Pressure (kPa)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Fail-Safe Control Room */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-200">Hardware Fail-Safe Control Station</h3>
                  <p className="text-xs text-slate-400">Manual override interlocks activate automated heaters, active thermal fans, or load drop routines.</p>
                </div>
                <button 
                  onClick={() => setManualOverride(!manualOverride)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition ${
                    manualOverride ? 'bg-red-600 text-white shadow-lg animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {manualOverride ? 'MANUAL OVERRIDE ACTIVE' : 'ENABLE MANUAL OVERRIDE'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className={`p-4 rounded-lg border transition ${manualOverride ? 'border-indigo-500/50 bg-slate-800/80' : 'border-slate-800 bg-slate-950/40 opacity-60'}`}>
                  <span className="text-xs font-medium text-slate-400">Thermal Sub-Assembly Heater</span>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold">{heatingPad ? 'ACTIVE (Sub-Zero Protection)' : 'DISABLED'}</span>
                    <button 
                      disabled={!manualOverride}
                      onClick={() => setHeatingPad(!heatingPad)}
                      className={`px-3 py-1 text-xs rounded font-medium ${heatingPad ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      Toggle
                    </button>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border transition ${manualOverride ? 'border-indigo-500/50 bg-slate-800/80' : 'border-slate-800 bg-slate-950/40 opacity-60'}`}>
                  <span className="text-xs font-medium text-slate-400">Convective Cooling Fan Mode</span>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold">Speed: {fanSpeed}</span>
                    <button 
                      disabled={!manualOverride}
                      onClick={() => setFanSpeed(fanSpeed === 'MAX' ? 'AUTO' : 'MAX')}
                      className="px-3 py-1 text-xs rounded font-medium bg-indigo-600 text-white"
                    >
                      {fanSpeed === 'MAX' ? 'Set AUTO' : 'Set MAX'}
                    </button>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border transition ${manualOverride ? 'border-indigo-500/50 bg-slate-800/80' : 'border-slate-800 bg-slate-950/40 opacity-60'}`}>
                  <span className="text-xs font-medium text-slate-400">Non-Critical Load Shedding</span>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold">{loadShedding ? 'SHEDDING (50% Load)' : 'NORMAL LOAD'}</span>
                    <button 
                      disabled={!manualOverride}
                      onClick={() => setLoadShedding(!loadShedding)}
                      className={`px-3 py-1 text-xs rounded font-medium ${loadShedding ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                    >
                      Toggle
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 2: Explainable AI & Model Studio */}
        {activeTab === 'explainability' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h2 className="text-lg font-bold mb-2 text-indigo-400">Model Interpretability & Feature Attributions</h2>
              <p className="text-xs text-slate-400 mb-6">
                Random Forest classifier feature weights determining high-altitude system failure prediction.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-sm font-semibold mb-4 text-slate-300">Feature Importance Weights</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'Dielectric Margin', weight: 0.34 },
                        { name: 'Internal Temp', weight: 0.28 },
                        { name: 'Altitude (m)', weight: 0.18 },
                        { name: 'Ambient Temp', weight: 0.11 },
                        { name: 'Vibration', weight: 0.09 }
                      ]} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" stroke="#64748b" />
                        <YAxis dataKey="name" type="category" stroke="#64748b" width={110} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                        <Bar dataKey="weight" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold text-slate-200">How Model Decisions Are Made</h3>
                  <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                    <li><strong className="text-slate-200">Paschen's Law Trigger:</strong> The model places the highest importance (34%) on the dielectric safety factor because low pressure dramatically lowers air breakdown voltage.</li>
                    <li><strong className="text-slate-200">Thermal Insulation Effect:</strong> Thin air provides weak convective mass flow, meaning component internal temperature rises rapidly even when outside temperatures drop below freezing (-20°C).</li>
                    <li><strong className="text-slate-200">Failure Boundaries:</strong> Internal temperatures exceeding 105°C trigger immediate Critical alerts due to risk of semiconductor junction destruction.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3: Raw Telemetry Explorer */}
        {activeTab === 'explorer' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold mb-2 text-indigo-400">High Altitude Dataset Inspection</h2>
            <p className="text-xs text-slate-400 mb-6">First 5 physics-derived synthetic dataset samples used to train the machine learning pipeline.</p>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="p-3">Altitude (m)</th>
                    <th className="p-3">Ambient (°C)</th>
                    <th className="p-3">Pressure (kPa)</th>
                    <th className="p-3">Current (A)</th>
                    <th className="p-3">Internal Temp (°C)</th>
                    <th className="p-3">Dielectric Margin</th>
                    <th className="p-3">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr className="hover:bg-slate-800/50">
                    <td className="p-3">4520.0</td>
                    <td className="p-3">-18.2</td>
                    <td className="p-3">57.41</td>
                    <td className="p-3">32.1</td>
                    <td className="p-3">92.4</td>
                    <td className="p-3">22.1</td>
                    <td className="p-3 text-amber-400 font-bold">WARNING</td>
                  </tr>
                  <tr className="hover:bg-slate-800/50">
                    <td className="p-3">1200.0</td>
                    <td className="p-3">15.0</td>
                    <td className="p-3">87.50</td>
                    <td className="p-3">12.0</td>
                    <td className="p-3">42.1</td>
                    <td className="p-3">68.3</td>
                    <td className="p-3 text-emerald-400 font-bold">OPTIMAL</td>
                  </tr>
                  <tr className="hover:bg-slate-800/50">
                    <td className="p-3">6100.0</td>
                    <td className="p-3">-35.0</td>
                    <td className="p-3">46.20</td>
                    <td className="p-3">45.0</td>
                    <td className="p-3">112.8</td>
                    <td className="p-3">11.2</td>
                    <td className="p-3 text-red-400 font-bold">CRITICAL</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}