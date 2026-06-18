import { useState, useEffect, useCallback } from 'react'
import type { InputState, ModelOutput } from '../types'
import {
  PROVIDERS,
  type CloudProvider,
  isApiLimitError,
  extractFinancialsUniversal,
  streamAnalysisUniversal,
  type AnalysisParams,
} from '../lib/universalAI'
import {
  checkOllama,
  listModels,
  type OllamaModel,
  extractFinancialsLocal,
} from '../lib/ollama'
import { runStartupAgent, type AgentEvent } from '../lib/ollamaAgent'
import type { ExtractedFinancials } from '../lib/claude'
import { detectSystemSpecs, recommendModelForVRAM, getVRAMFit, type SystemSpecs } from '../lib/systemDetect'
import { MODEL_CATALOG, type ModelInfo } from '../lib/ollamaModels'
import {
  loadWebLLMEngine,
  getCurrentEngine,
  isWebGPUSupported,
  extractFinancialsWebLLM,
  streamAnalysisWebLLM,
  runAgentWebLLM,
  type WebLLMLoadProgress,
} from '../lib/webllmEngine'

interface Props {
  onApply: (partial: Partial<InputState>) => void
  modelOutput: ModelOutput
  inputs: InputState
}

type Mode = 'cloud' | 'local'

type AgentStep = {
  id: number
  label: string
  status: 'pending' | 'done'
  result?: string
}

function loadApiKey(provider: CloudProvider): string {
  return localStorage.getItem(`api_key_${provider}`) ?? ''
}
function saveApiKey(provider: CloudProvider, key: string) {
  if (key) localStorage.setItem(`api_key_${provider}`, key)
  else localStorage.removeItem(`api_key_${provider}`)
}
function loadModel(provider: CloudProvider): string {
  const saved = localStorage.getItem(`model_${provider}`) ?? ''
  const models = PROVIDERS.find(p => p.id === provider)?.models ?? []
  return models.some(m => m.id === saved) ? saved : (models[0]?.id ?? '')
}
function saveModel(provider: CloudProvider, model: string) {
  localStorage.setItem(`model_${provider}`, model)
}

// ── VRAM fit badge ────────────────────────────────────────────────────────────

function VRAMBadge({
  model,
  gpuVRAM,
  isRecommended,
}: {
  model: ModelInfo
  gpuVRAM: number | null
  isRecommended: boolean
}) {
  const fit = getVRAMFit(model.vramGB, gpuVRAM)
  const sizeLabel = model.vramGB >= 1 ? `${model.vramGB}GB` : `${(model.vramGB * 1024).toFixed(0)}MB`

  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
        isRecommended
          ? 'bg-violet-700 text-violet-200'
          : fit === 'fits'
            ? 'bg-green-900/60 text-green-400'
            : fit === 'partial'
              ? 'bg-amber-900/60 text-amber-400'
              : fit === 'cpu'
                ? 'bg-red-900/60 text-red-400'
                : 'bg-slate-700 text-slate-400'
      }`}
    >
      {isRecommended
        ? `★ ${sizeLabel}`
        : fit === 'fits'
          ? `✓ ${sizeLabel}`
          : fit === 'partial'
            ? `⚠ ${sizeLabel}`
            : fit === 'cpu'
              ? `✗ ${sizeLabel}`
              : sizeLabel}
    </span>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────

function ModelCard({
  model,
  gpuVRAM,
  isRecommended,
  isActive,
  isLoading,
  loadProgress,
  loadError,
  onLoad,
}: {
  model: ModelInfo
  gpuVRAM: number | null
  isRecommended: boolean
  isActive: boolean
  isLoading: boolean
  loadProgress?: WebLLMLoadProgress
  loadError?: string
  onLoad: () => void
}) {
  const fit = getVRAMFit(model.vramGB, gpuVRAM)

  return (
    <div
      className={`relative rounded-xl p-3 border transition-all flex flex-col gap-2 ${
        isActive
          ? 'border-violet-500 bg-violet-900/20'
          : isRecommended
            ? 'border-violet-700/50 bg-slate-700/60'
            : 'border-slate-700 bg-slate-700/40'
      }`}
    >
      {isRecommended && (
        <div className="absolute -top-px left-3 right-3 h-0.5 rounded-full bg-violet-500" />
      )}

      {/* Name + badges row */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-semibold leading-tight truncate">{model.label}</p>
          <p className="text-slate-400 text-xs mt-0.5 leading-tight line-clamp-2">{model.description}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <VRAMBadge model={model} gpuVRAM={gpuVRAM} isRecommended={isRecommended} />
          <span className="text-slate-500 text-xs">{model.sizeGB}GB</span>
        </div>
      </div>

      {/* Feature badges */}
      <div className="flex flex-wrap gap-1">
        {model.toolCalling && (
          <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded">tool calling</span>
        )}
        {model.reasoning && (
          <span className="text-xs bg-purple-900/50 text-purple-400 px-1.5 py-0.5 rounded">reasoning</span>
        )}
        {model.webllmId ? (
          <span className="text-xs bg-teal-900/50 text-teal-400 px-1.5 py-0.5 rounded">browser</span>
        ) : (
          <span className="text-xs bg-slate-700/60 text-slate-500 px-1.5 py-0.5 rounded">Ollama only</span>
        )}
        {fit === 'partial' && (
          <span className="text-xs bg-amber-900/40 text-amber-500 px-1.5 py-0.5 rounded">partial GPU</span>
        )}
        {fit === 'cpu' && (
          <span className="text-xs bg-red-900/40 text-red-500 px-1.5 py-0.5 rounded">CPU heavy</span>
        )}
      </div>

      {/* Load progress */}
      {isLoading && loadProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 truncate max-w-[80%] leading-snug">{loadProgress.text}</span>
            <span className="text-slate-300 font-mono ml-2">{Math.round(loadProgress.progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-slate-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${loadProgress.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <p className="text-red-400 text-xs leading-snug">{loadError}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5 mt-auto">
        {isActive ? (
          <span className="text-violet-300 text-xs font-medium flex items-center gap-1">
            <span>✓</span> Active
          </span>
        ) : isLoading ? (
          <span className="text-slate-400 text-xs">Loading in browser…</span>
        ) : !model.webllmId ? (
          <span className="text-slate-500 text-xs">Requires Ollama — not available in browser</span>
        ) : (
          <button
            onClick={onLoad}
            className="w-full text-xs py-1.5 rounded-lg font-medium bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors"
          >
            {loadError ? '↺ Retry' : '↓ Download'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AIPanel({ onApply, modelOutput, inputs }: Props) {
  const [mode, setMode] = useState<Mode>('cloud')
  const [provider, setProvider] = useState<CloudProvider>('anthropic')
  const [apiKey, setApiKey] = useState(() => loadApiKey('anthropic'))
  const [selectedModel, setSelectedModel] = useState(() => loadModel('anthropic'))
  const [autoFallback, setAutoFallback] = useState(false)
  const [fallbackNote, setFallbackNote] = useState<string | null>(null)

  // Ollama — only used for cloud auto-fallback
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [selectedOllamaModel, setSelectedOllamaModel] = useState(
    () => localStorage.getItem('ollama_selected_model') ?? ''
  )

  // WebLLM — local mode
  const webGPU = isWebGPUSupported()
  const [webllmStatus, setWebllmStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [webllmActiveId, setWebllmActiveId] = useState<string | null>(null)
  const [webllmLoadingId, setWebllmLoadingId] = useState<string | null>(null)
  const [webllmProgress, setWebllmProgress] = useState<WebLLMLoadProgress | null>(null)
  const [webllmError, setWebllmError] = useState<string | null>(null)
  const [webllmErrorId, setWebllmErrorId] = useState<string | null>(null)

  // System detection
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null)
  const [showModels, setShowModels] = useState(false)

  // Extraction
  const [description, setDescription] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedFinancials | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  // Analysis
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisText, setAnalysisText] = useState('')
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [agentAnswer, setAgentAnswer] = useState('')
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // ── Ollama probe (cloud auto-fallback only) ─────────────────────────────────

  const probeOllama = useCallback(async (): Promise<OllamaModel[]> => {
    setOllamaStatus('checking')
    const ok = await checkOllama()
    if (!ok) { setOllamaStatus('error'); return [] }
    try {
      const models = await listModels()
      setOllamaModels(models)
      setOllamaStatus('connected')
      setSelectedOllamaModel(prev => {
        if (!prev && models.length > 0) {
          const first = models[0].name
          localStorage.setItem('ollama_selected_model', first)
          return first
        }
        return prev
      })
      return models
    } catch {
      setOllamaStatus('error')
      return []
    }
  }, [])

  useEffect(() => {
    if (autoFallback && ollamaStatus === 'idle') probeOllama()
  }, [autoFallback, ollamaStatus, probeOllama])

  // ── GPU detect (local mode) ─────────────────────────────────────────────────

  const handleDetectGPU = useCallback(() => {
    setSystemSpecs(detectSystemSpecs())
  }, [])

  useEffect(() => {
    if (mode === 'local' && !systemSpecs) handleDetectGPU()
  }, [mode, systemSpecs, handleDetectGPU])

  // ── Load WebLLM model ───────────────────────────────────────────────────────

  const handleLoad = async (modelName: string, webllmId: string) => {
    setWebllmLoadingId(modelName)
    setWebllmStatus('loading')
    setWebllmProgress({ text: 'Initializing…', progress: 0, done: false })
    setWebllmError(null)
    setWebllmErrorId(null)
    try {
      await loadWebLLMEngine(webllmId, p => {
        setWebllmProgress(p)
      })
      setWebllmActiveId(modelName)
      setWebllmStatus('ready')
      localStorage.setItem('webllm_active_model', modelName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setWebllmError(msg)
      setWebllmErrorId(modelName)
      setWebllmStatus('error')
    } finally {
      setWebllmLoadingId(null)
    }
  }

  // ── Provider / cloud ────────────────────────────────────────────────────────

  const handleProviderChange = (p: CloudProvider) => {
    setProvider(p)
    setApiKey(loadApiKey(p))
    setSelectedModel(loadModel(p))
  }

  const handleOllamaModelChange = (m: string) => {
    setSelectedOllamaModel(m)
    localStorage.setItem('ollama_selected_model', m)
  }

  const getParams = (): AnalysisParams => {
    const find = (key: string) => modelOutput.scenarios.find(s => s.config.key === key)
    return {
      startingCash: inputs.startingCash,
      monthlyBurn: inputs.monthlyBurn,
      monthlyRevenue: inputs.monthlyRevenue,
      pessimisticMonths: find('pessimistic')?.runwayMonths ?? 0,
      baseMonths: find('base')?.runwayMonths ?? 0,
      optimisticMonths: find('optimistic')?.runwayMonths ?? 0,
    }
  }

  // ── Extraction ──────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!description.trim()) return
    setExtracting(true)
    setExtracted(null)
    setExtractError(null)
    setFallbackNote(null)
    try {
      let result: ExtractedFinancials
      if (mode === 'cloud') {
        try {
          result = await extractFinancialsUniversal(description, provider, apiKey, selectedModel)
        } catch (err) {
          if (autoFallback && isApiLimitError(err) && selectedOllamaModel) {
            const pName = PROVIDERS.find(p => p.id === provider)?.name ?? provider
            setFallbackNote(`⚡ ${pName} unavailable — switched to Ollama automatically`)
            result = await extractFinancialsLocal(description, selectedOllamaModel)
          } else throw err
        }
      } else {
        const current = getCurrentEngine()
        if (!current) throw new Error('No model loaded — select a model below first')
        result = await extractFinancialsWebLLM(description, current.engine)
      }
      setExtracted(result)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : String(err))
    } finally {
      setExtracting(false)
    }
  }

  // ── Agent (Ollama — used by cloud fallback) ──────────────────────────────────

  const runOllamaAgent = async (params: AnalysisParams, ollamaModel: string) => {
    let stepId = 0
    await runStartupAgent(params, ollamaModel, (event: AgentEvent) => {
      if (event.type === 'tool_call') {
        const id = ++stepId
        const label =
          event.name === 'search_market_data'
            ? `Searching HN: "${event.args.query ?? ''}"`
            : `Loading benchmarks: ${event.args.category ?? ''}`
        setAgentSteps(prev => [...prev, { id, label, status: 'pending' }])
      } else if (event.type === 'tool_result') {
        setAgentSteps(prev =>
          prev.map((s, i) =>
            i === prev.length - 1 && s.status === 'pending'
              ? { ...s, status: 'done', result: event.result.slice(0, 200) }
              : s
          )
        )
      } else if (event.type === 'answer') {
        setAgentAnswer(event.content)
      } else if (event.type === 'error') {
        setAnalysisError(event.message)
      }
    })
  }

  // ── Agent (WebLLM — used by local mode) ──────────────────────────────────────

  const runWebLLMAgent = async (params: AnalysisParams) => {
    const current = getCurrentEngine()
    if (!current) throw new Error('No model loaded')
    let stepId = 0
    await runAgentWebLLM(params, current.engine, (event: AgentEvent) => {
      if (event.type === 'tool_call') {
        const id = ++stepId
        const label =
          event.name === 'search_market_data'
            ? `Searching HN: "${event.args.query ?? ''}"`
            : `Loading benchmarks: ${event.args.category ?? ''}`
        setAgentSteps(prev => [...prev, { id, label, status: 'pending' }])
      } else if (event.type === 'tool_result') {
        setAgentSteps(prev =>
          prev.map((s, i) =>
            i === prev.length - 1 && s.status === 'pending'
              ? { ...s, status: 'done', result: event.result.slice(0, 200) }
              : s
          )
        )
      } else if (event.type === 'answer') {
        setAgentAnswer(event.content)
      } else if (event.type === 'error') {
        setAnalysisError(event.message)
      }
    })
  }

  // ── Analysis ────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalysisText('')
    setAgentSteps([])
    setAgentAnswer('')
    setAnalysisError(null)
    setFallbackNote(null)
    const params = getParams()
    try {
      if (mode === 'local') {
        // Try agent first, fall back to direct stream if model doesn't support tool calling
        try {
          await runWebLLMAgent(params)
        } catch {
          const current = getCurrentEngine()
          if (current) {
            await streamAnalysisWebLLM(params, current.engine, chunk => {
              setAnalysisText(prev => prev + chunk)
            })
          }
        }
        return
      }
      try {
        await streamAnalysisUniversal(params, provider, apiKey, selectedModel, chunk => {
          setAnalysisText(prev => prev + chunk)
        })
      } catch (err) {
        if (autoFallback && isApiLimitError(err) && selectedOllamaModel) {
          const pName = PROVIDERS.find(p => p.id === provider)?.name ?? provider
          setFallbackNote(`⚡ ${pName} unavailable — switched to Ollama automatically`)
          setAnalysisText('')
          await runOllamaAgent(params, selectedOllamaModel)
          return
        }
        throw err
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
    }
  }

  const handleApply = () => {
    if (!extracted) return
    const partial: Partial<InputState> = {}
    if (extracted.startingCash !== null) partial.startingCash = extracted.startingCash
    if (extracted.monthlyBurn !== null) partial.monthlyBurn = extracted.monthlyBurn
    if (extracted.monthlyRevenue !== null) partial.monthlyRevenue = extracted.monthlyRevenue
    onApply(partial)
  }

  const handleClear = () => {
    setExtracted(null); setExtractError(null); setDescription('')
    setAnalysisText(''); setAgentSteps([]); setAgentAnswer('')
    setAnalysisError(null); setFallbackNote(null)
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const isCloudReady = mode === 'cloud' && apiKey.trim().length > 0
  const isLocalReady = mode === 'local' && webllmStatus === 'ready'
  const isReady = isCloudReady || isLocalReady
  const canAnalyze = isReady && (inputs.startingCash > 0 || inputs.monthlyBurn > 0)
  const provDef = PROVIDERS.find(p => p.id === provider)!
  const isAgentMode = mode === 'local' || (!!fallbackNote && agentSteps.length > 0)
  const recommendedModel = recommendModelForVRAM(systemSpecs?.gpuVRAM ?? null)

  const fmtVal = (v: number) =>
    v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-semibold text-base">AI Assistant</h2>
          <p className="text-slate-400 text-xs mt-0.5">Auto-fill your numbers · get strategic analysis</p>
        </div>
        <div className="flex bg-slate-700 rounded-lg p-0.5 gap-0.5">
          {(['cloud', 'local'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'cloud' ? '☁️ Cloud' : '💻 Local'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cloud config ───────────────────────────────────────────────────── */}
      {mode === 'cloud' && (
        <div className="space-y-3 mb-4 pb-4 border-b border-slate-700">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => handleProviderChange(p.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  provider === p.id
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); saveApiKey(provider, e.target.value) }}
              placeholder={provDef.keyPlaceholder}
              className="flex-1 bg-slate-700 text-white text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-violet-500 outline-none placeholder-slate-500"
            />
            <select value={selectedModel} onChange={e => { setSelectedModel(e.target.value); saveModel(provider, e.target.value) }}
              className="bg-slate-700 text-slate-300 text-xs px-2 py-2 rounded-lg border border-slate-600 focus:border-violet-500 outline-none"
            >
              {provDef.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {!apiKey && (
            <a href={provDef.freeKeyUrl} target="_blank" rel="noreferrer"
              className="text-violet-400 hover:text-violet-300 text-xs underline">
              Get a free {provDef.name} key →
            </a>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <button type="button" onClick={() => setAutoFallback(v => !v)}
              className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${autoFallback ? 'bg-amber-500' : 'bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoFallback ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-slate-400 text-xs">↩ Auto-fallback to Ollama if API limit hit</span>
          </label>
          {autoFallback && (
            <div className="flex items-center gap-2">
              {ollamaStatus === 'checking' && <span className="text-slate-400 text-xs">Checking Ollama…</span>}
              {ollamaStatus === 'error' && <span className="text-amber-400 text-xs">Ollama not running — start it for fallback</span>}
              {ollamaStatus === 'connected' && ollamaModels.length > 0 && (
                <>
                  <span className="text-green-400 text-xs font-medium">● Ollama ready</span>
                  <select value={selectedOllamaModel} onChange={e => handleOllamaModelChange(e.target.value)}
                    className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded border border-slate-600 outline-none"
                  >
                    {ollamaModels.map(m => {
                      const sz = m.details?.parameter_size ?? ''
                      const q = m.details?.quantization_level ?? ''
                      return <option key={m.name} value={m.name}>{[m.name, sz, q].filter(Boolean).join(' · ')}</option>
                    })}
                  </select>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Local (WebLLM) config ────────────────────────────────────────────── */}
      {mode === 'local' && (
        <div className="space-y-3 mb-4 pb-4 border-b border-slate-700">
          {/* WebGPU status */}
          <div className="flex items-center gap-3">
            {webGPU ? (
              <span className="text-green-400 text-sm font-medium">● WebGPU ready</span>
            ) : (
              <span className="text-red-400 text-sm font-medium">⚠ WebGPU unavailable</span>
            )}
            <button onClick={handleDetectGPU}
              className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg border border-slate-600 transition-colors"
            >
              ⟳ Detect GPU
            </button>
          </div>

          {!webGPU && (
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-2 text-amber-300 text-xs leading-relaxed">
              WebGPU is required to run models in the browser. Use Chrome or Edge 113+ on desktop.
            </div>
          )}

          {/* System specs */}
          {systemSpecs && (
            <div className="bg-slate-900/60 rounded-lg px-3 py-2.5 border border-slate-700/50 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-300 text-xs font-medium">{systemSpecs.gpuName}</span>
                {systemSpecs.gpuVRAM !== null && (
                  <span className="text-violet-400 text-xs font-semibold">{systemSpecs.gpuVRAM}GB VRAM</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-slate-500 text-xs">
                {systemSpecs.ramGB !== null && <span>RAM ≥{systemSpecs.ramGB}GB</span>}
                {systemSpecs.cpuCores > 0 && <span>{systemSpecs.cpuCores} CPU cores</span>}
                {!systemSpecs.gpuVRAM && <span className="text-amber-500">VRAM unknown — WebGL info unavailable</span>}
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-slate-500 text-xs">Recommended:</span>
                <span className="text-violet-300 text-xs font-mono font-semibold">{recommendedModel}</span>
              </div>
            </div>
          )}

          {/* Active model status */}
          {webllmStatus === 'ready' && webllmActiveId && (
            <div className="flex items-center gap-2 bg-violet-900/20 border border-violet-700/40 rounded-lg px-3 py-2">
              <span className="text-violet-300 text-xs font-medium">✓ Active:</span>
              <span className="text-white text-xs font-semibold">
                {MODEL_CATALOG.find(m => m.name === webllmActiveId)?.label ?? webllmActiveId}
              </span>
              <span className="text-slate-500 text-xs ml-auto">runs in browser</span>
            </div>
          )}

          {webllmStatus === 'idle' && (
            <p className="text-slate-500 text-xs">
              Select a model below · downloads once · stays cached in your browser
            </p>
          )}

          {webllmError && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-xs">
              {webllmError}
            </div>
          )}

          {/* Model browser toggle */}
          <button onClick={() => setShowModels(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <span>{showModels ? '▾' : '▸'}</span>
            <span>Browse &amp; download models ({MODEL_CATALOG.length})</span>
          </button>

          {/* Model browser */}
          {showModels && (
            <div className="space-y-2">
              {systemSpecs?.gpuVRAM && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="text-green-400">✓ GPU fits</span>
                  <span className="text-amber-400">⚠ partial GPU</span>
                  <span className="text-red-400">✗ CPU heavy</span>
                  <span className="text-teal-400">browser = no install needed</span>
                  <span className="text-violet-400 ml-auto">★ recommended for your {systemSpecs.gpuVRAM}GB</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[480px] overflow-y-auto pr-1">
                {MODEL_CATALOG.map(m => {
                  const isActive = webllmActiveId === m.name
                  const isLoading = webllmLoadingId === m.name
                  const isRec = m.name === recommendedModel
                  return (
                    <ModelCard
                      key={m.name}
                      model={m}
                      gpuVRAM={systemSpecs?.gpuVRAM ?? null}
                      isRecommended={isRec}
                      isActive={isActive}
                      isLoading={isLoading}
                      loadProgress={isLoading ? webllmProgress ?? undefined : undefined}
                      loadError={webllmErrorId === m.name ? webllmError ?? undefined : undefined}
                      onLoad={() => m.webllmId ? handleLoad(m.name, m.webllmId) : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback banner */}
      {fallbackNote && (
        <div className="mb-3 bg-amber-900/30 border border-amber-700/50 rounded-lg px-3 py-2 text-amber-300 text-xs">
          {fallbackNote}
        </div>
      )}

      {/* ── Describe startup ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-slate-300 text-sm font-medium">Describe your startup</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. We raised $1.2M seed, spending $90K/month on a team of 6, currently at $15K MRR and growing…"
          rows={3}
          className="w-full bg-slate-700 text-white text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:border-violet-500 outline-none resize-none placeholder-slate-500 leading-relaxed"
        />
        <button onClick={handleExtract} disabled={!isReady || !description.trim() || extracting}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
        >
          {extracting ? 'Extracting…'
            : mode === 'cloud' ? `✨ Extract with ${provDef.name}`
            : '💻 Extract with Local AI'}
        </button>
      </div>

      {extractError && (
        <div className="mt-3 bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-xs">
          {extractError}
        </div>
      )}

      {/* ── Extracted results ────────────────────────────────────────────────── */}
      {extracted && (
        <div className="mt-4 bg-slate-700/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 text-sm font-semibold">Extracted Numbers</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              extracted.confidence === 'high' ? 'bg-green-900/60 text-green-400'
                : extracted.confidence === 'medium' ? 'bg-amber-900/60 text-amber-400'
                : 'bg-red-900/60 text-red-400'
            }`}>{extracted.confidence} confidence</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Cash', value: extracted.startingCash },
              { label: 'Monthly Burn', value: extracted.monthlyBurn },
              { label: 'MRR', value: extracted.monthlyRevenue },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-700 rounded-lg px-3 py-2.5 text-center">
                <div className="text-slate-400 text-xs mb-1">{label}</div>
                <div className={`text-sm font-bold ${value !== null ? 'text-white' : 'text-slate-500'}`}>
                  {value !== null ? fmtVal(value) : '—'}
                </div>
              </div>
            ))}
          </div>
          <p className="text-slate-400 text-xs italic">{extracted.explanation}</p>
          {extracted.missing.length > 0 && (
            <p className="text-amber-400 text-xs">Missing: {extracted.missing.join(', ')}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleApply}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-2 rounded-lg font-medium transition-colors">
              Apply Numbers
            </button>
            <button onClick={handleClear}
              className="px-4 bg-slate-600 hover:bg-slate-500 text-slate-300 text-sm py-2 rounded-lg transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ── Analysis ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
        <button onClick={handleAnalyze} disabled={!canAnalyze || analyzing}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white"
        >
          {analyzing
            ? isAgentMode ? '🤖 Agent researching…' : '⚡ Analyzing…'
            : mode === 'local' ? '🤖 Agent Analysis · live market data' : '⚡ Get Strategic Analysis'}
        </button>

        {analysisError && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-3 py-2 text-red-300 text-xs">
            {analysisError}
          </div>
        )}

        {/* Cloud streaming text */}
        {analysisText && !isAgentMode && (
          <div className="bg-slate-700/50 rounded-xl p-4 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {analysisText}
            {analyzing && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />}
          </div>
        )}

        {/* WebLLM direct analysis (no tool calling) */}
        {analysisText && isAgentMode && mode === 'local' && agentSteps.length === 0 && (
          <div className="bg-slate-700/50 rounded-xl p-4 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
            {analysisText}
            {analyzing && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />}
          </div>
        )}

        {/* Agent steps + answer */}
        {isAgentMode && (agentSteps.length > 0 || agentAnswer) && (
          <div className="space-y-2">
            {agentSteps.map(step => (
              <div key={step.id} className="bg-slate-700/50 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {step.status === 'pending'
                    ? <span className="text-slate-400 text-xs animate-spin inline-block">◌</span>
                    : <span className="text-green-400 text-xs">✓</span>}
                  <span className="text-slate-300 text-xs font-medium truncate">{step.label}</span>
                </div>
                {step.result && step.status === 'done' && (
                  <p className="text-slate-500 text-xs mt-1 ml-5 line-clamp-2 leading-relaxed">{step.result}</p>
                )}
              </div>
            ))}
            {analyzing && agentSteps.length > 0 && !agentAnswer && (
              <div className="flex items-center gap-2 text-slate-400 text-xs px-1">
                <span className="animate-spin inline-block">◌</span>
                <span>Thinking…</span>
              </div>
            )}
            {agentAnswer && (
              <div className="bg-slate-700/50 rounded-xl p-4 text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                {agentAnswer}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
