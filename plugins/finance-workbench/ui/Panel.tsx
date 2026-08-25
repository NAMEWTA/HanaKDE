import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { hana } from '@hana/plugin-sdk';
import { Button, HanaThemeProvider, Select, Switch, TextInput } from '@hana/plugin-components';
import '@hana/plugin-components/styles.css';
import './panel.css';

type Tab = 'overview' | 'market' | 'research' | 'portfolio' | 'quant' | 'automation' | 'agent' | 'exchange' | 'diagnostics';
type Json = Record<string, any>;
const NAV: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: '总览' }, { id: 'market', label: '市场' }, { id: 'research', label: '研究' },
  { id: 'portfolio', label: '组合' }, { id: 'quant', label: '量化' }, { id: 'automation', label: '自动化' },
  { id: 'agent', label: 'Agent' }, { id: 'exchange', label: '交换' }, { id: 'diagnostics', label: '诊断' },
];
const BACKTEST_ASSUMPTIONS = { calendar: 'versioned', marketRules: 'A-HK-research-v1', tPlusOne: true, priceLimits: 'market-specific-v1', pit: true, adjustment: 'none', fees: 0.001, slippage: 0.001, liquidity: 'daily-volume-5pct', capacity: 1000000 };

async function api(path: string, init?: RequestInit): Promise<Json> {
  const response = await hana.api.fetch(path, init);
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error?.message || `请求失败 (${response.status})`);
  return body;
}

function Panel() {
  const compact = (document.getElementById('root')?.dataset.surface || 'page') === 'widget';
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Json>({});
  const [capabilities, setCapabilities] = useState<Json>({ cells: [], sourcePolicies: [] });
  const [assets, setAssets] = useState<Json[]>([]);
  const [selectedAsset, setSelectedAsset] = useState('600519.SH');
  const [quote, setQuote] = useState<Json>({});
  const [dossier, setDossier] = useState<Json>({ records: [] });
  const [lists, setLists] = useState<Json>({ watchlists: [], researchPools: [] });
  const [portfolio, setPortfolio] = useState<Json>({ positions: [], totalsByCurrency: [] });
  const [strategies, setStrategies] = useState<Json[]>([]);
  const [backtests, setBacktests] = useState<Json[]>([]);
  const [monitors, setMonitors] = useState<Json[]>([]);
  const [tasks, setTasks] = useState<Json[]>([]);
  const [diagnostics, setDiagnostics] = useState<Json>({ events: [], counts: {} });
  const [agentResult, setAgentResult] = useState<Json | null>(null);
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('ALL');
  const [ledgerText, setLedgerText] = useState('[{"assetId":"600519.SH","side":"buy","quantity":10,"price":1380,"fee":8,"date":"2026-08-01"}]');
  const [ledgerPreview, setLedgerPreview] = useState<Json | null>(null);
  const [exportPreview, setExportPreview] = useState<Json | null>(null);
  const [experimental, setExperimental] = useState(false);
  const [backtestConfirmed, setBacktestConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (compact) {
        const summary = await api('api/widget-summary');
        setStatus(summary); setQuote(summary.quote); setPortfolio({ positions: Array.from({ length: summary.positionCount }), totalsByCurrency: [] }); setMonitors(Array.from({ length: summary.monitorCount }));
        return;
      }
      const [s, c, a, l, p, st, bt, m, d] = await Promise.all([
        api('api/status'), api('api/capabilities'), api('api/assets'), api('api/lists'), api('api/portfolio'),
        api('api/strategies'), api('api/backtests'), api('api/monitors'), api('api/diagnostics'),
      ]);
      setStatus(s); setCapabilities(c); setAssets(a.assets); setLists(l); setPortfolio(p);
      setStrategies(st.strategies); setBacktests(bt.backtests); setMonitors(m.monitors); setTasks(m.tasks || []); setDiagnostics(d);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [compact]);

  const loadAsset = useCallback(async (assetId: string) => {
    setBusy('asset'); setError('');
    try {
      const [q, r] = await Promise.all([api(`api/quote/${encodeURIComponent(assetId)}`), api(`api/research/${encodeURIComponent(assetId)}`)]);
      setQuote(q); setDossier(r);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(''); }
  }, []);

  useEffect(() => { hana.ready(); hana.ui.resize({ height: compact ? 520 : 760 }); void load(); }, [compact, load]);
  useEffect(() => { if (!compact) void loadAsset(selectedAsset); }, [compact, selectedAsset, loadAsset]);
  const filteredAssets = useMemo(() => assets.filter((asset) => (market === 'ALL' || asset.market === market) && (!query || `${asset.assetId}${asset.name}`.toLowerCase().includes(query.toLowerCase()))), [assets, market, query]);
  const selected = assets.find((asset) => asset.assetId === selectedAsset);
  const rows = quote.snapshot?.rows || [];
  const capabilityCounts = useMemo(() => Object.fromEntries(['supported', 'partial', 'experimental', 'unavailable', 'blocked'].map((state) => [state, capabilities.cells.filter((cell: Json) => cell.status === state).length])), [capabilities]);

  async function act(name: string, task: () => Promise<void>) { setBusy(name); setError(''); try { await task(); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); } }
  const addWatchlist = () => act('watchlist', async () => { await api('api/lists', json({ kind: 'watchlist', action: 'add', assetId: selectedAsset })); });
  const previewLedger = () => act('ledger-preview', async () => { const result = await api('api/portfolio/preview', json({ format: 'json', content: ledgerText })); setLedgerPreview(result.preview); });
  const commitLedger = () => ledgerPreview ? act('ledger-commit', async () => { await api('api/portfolio/commit', json({ previewId: ledgerPreview.previewId, revision: ledgerPreview.baseRevision, digest: ledgerPreview.digest })); setLedgerPreview(null); }) : Promise.resolve();
  const saveStrategy = () => act('strategy', async () => { await api('api/strategies', json({ name: 'A/HK 质量研究', universe: ['600519.SH', '00700.HK'], filters: [], factors: [{ field: 'price_momentum', weight: 1 }], rebalance: 'monthly', missing: 'exclude' })); });
  const runBacktest = () => { const strategy = strategies.at(-1); if (!strategy) { setError('请先保存策略'); return Promise.resolve(); } if (!backtestConfirmed) { setError('请先审核并确认全部回测假设'); return Promise.resolve(); } return act('backtest', async () => { await api('api/backtests', json({ immutableId: strategy.immutableId, allowExperimental: experimental, confirmed: true, runBudget: 10000, assumptions: BACKTEST_ASSUMPTIONS })); setBacktestConfirmed(false); }); };
  const createMonitor = () => act('monitor', async () => { await api('api/monitors', json({ assetId: selectedAsset, condition: 'above', threshold: Number(rows[0]?.price || 1) * 1.02, intervalSeconds: 60, cooldownSeconds: 300, confirmed: true })); });
  const monitorAction = (monitorId: string, action: string) => act(`monitor-${action}`, async () => { await api('api/monitors/action', json({ monitorId, action, confirmed: true })); });
  const createResearchTask = () => act('research-task', async () => { await api('api/research-tasks', json({ assetId: selectedAsset, intervalSeconds: 86400, confirmed: true })); });
  const taskAction = (taskId: string, action: string) => act(`research-task-${action}`, async () => { await api('api/research-tasks/action', json({ taskId, action, confirmed: true })); });
  const sourcePolicy = (mode: 'auto' | 'pinned') => act('source-policy', async () => { await api('api/source-policy', json({ market: selected?.market || 'A', dataset: 'quote', workflow: 'interactive', mode, ...(mode === 'pinned' ? { pinnedSource: 'hana-fixture' } : {}) })); });
  const runAgent = () => act('agent', async () => { const result = await api('api/agent/run', json({ assetId: selectedAsset, question: '汇总当前公开证据和限制', useModel: false })); setAgentResult(result.run); });
  const previewExport = () => act('export', async () => { const result = await api('api/exchange/preview', json({ format: 'json', sections: ['portfolio', 'strategies', 'backtests', 'monitors'] })); setExportPreview(result.preview); });

  if (compact) return <HanaThemeProvider mode="inherit" className="finance-app compact"><Widget status={status} quote={quote} portfolio={portfolio} monitors={monitors} loading={loading} /></HanaThemeProvider>;
  return <HanaThemeProvider mode="inherit" className="finance-app">
    <header className="topbar"><div><h1>Finance Workbench</h1><span className="version">v{status.plugin?.version || '1.0.0'}</span></div><div className="top-actions"><span className="no-trade">只读研究</span><Button variant="ghost" onClick={() => void load()} disabled={loading}>刷新</Button></div></header>
    <nav className="nav" aria-label="工作台导航">{NAV.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {error && <div className="error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="关闭错误">x</button></div>}
    <main className="workspace" aria-busy={loading || Boolean(busy)}>
      {tab === 'overview' && <Overview status={status} counts={capabilityCounts} portfolio={portfolio} monitors={monitors} backtests={backtests} onNavigate={setTab} />}
      {tab === 'market' && <Market capabilities={capabilities} assets={filteredAssets} query={query} setQuery={setQuery} market={market} setMarket={setMarket} selectedAsset={selectedAsset} setSelectedAsset={setSelectedAsset} quote={quote} onWatchlist={addWatchlist} onPolicy={sourcePolicy} busy={busy} />}
      {tab === 'research' && <Research selected={selected} dossier={dossier} lists={lists} onSelect={setSelectedAsset} />}
      {tab === 'portfolio' && <Portfolio portfolio={portfolio} ledgerText={ledgerText} setLedgerText={setLedgerText} preview={ledgerPreview} onPreview={previewLedger} onCommit={commitLedger} busy={busy} />}
      {tab === 'quant' && <Quant strategies={strategies} backtests={backtests} experimental={experimental} setExperimental={setExperimental} confirmed={backtestConfirmed} setConfirmed={setBacktestConfirmed} onSave={saveStrategy} onRun={runBacktest} busy={busy} />}
      {tab === 'automation' && <Automation monitors={monitors} tasks={tasks} selected={selected} onCreate={createMonitor} onAction={monitorAction} onCreateTask={createResearchTask} onTaskAction={taskAction} busy={busy} />}
      {tab === 'agent' && <Agent selected={selected} result={agentResult} onRun={runAgent} busy={busy} />}
      {tab === 'exchange' && <Exchange preview={exportPreview} onPreview={previewExport} busy={busy} />}
      {tab === 'diagnostics' && <Diagnostics diagnostics={diagnostics} capabilities={capabilities} />}
    </main>
  </HanaThemeProvider>;
}

function Overview({ status, counts, portfolio, monitors, backtests, onNavigate }: Json) { return <div className="stack"><section className="metrics"><Metric label="可用模块" value={String(status.modules?.length || 0)} detail="A / HK" /><Metric label="实验数据源" value={String(counts.experimental || 0)} detail={`${counts.blocked || 0} blocked`} /><Metric label="组合币种" value={String(portfolio.totalsByCurrency?.length || 0)} detail={`${portfolio.positions?.length || 0} positions`} /><Metric label="任务" value={String(monitors.length)} detail={`${backtests.length} backtests`} /></section><section className="band"><div><h2>能力状态</h2><p>数据集按来源、时间、单位与质量独立判定</p></div><StatusStrip counts={counts} /></section><section className="module-grid">{[['market','市场与来源'],['research','资产研究'],['portfolio','组合账本'],['quant','量化回测'],['automation','监控任务'],['agent','Agent 研究'],['exchange','导入导出'],['diagnostics','诊断审计']].map(([id,label]) => <button key={id} onClick={() => onNavigate(id)}><span>{label}</span><b>打开</b></button>)}</section><section className="notice"><strong>本地历史源</strong><span>{status.marketDump?.status || 'blocked'}</span><p>{status.marketDump?.reason}</p></section></div>; }
function Market({ capabilities, assets, query, setQuery, market, setMarket, selectedAsset, setSelectedAsset, quote, onWatchlist, onPolicy, busy }: Json) { const row = quote.snapshot?.rows?.[0]; return <div className="split"><aside className="asset-pane"><div className="filter-row"><TextInput aria-label="搜索资产" placeholder="代码或名称" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /><Select value={market} onChange={setMarket} options={[{value:'ALL',label:'全部'},{value:'A',label:'A 股'},{value:'HK',label:'港股'}]} /></div><div className="asset-list">{assets.map((asset: Json) => <button className={selectedAsset === asset.assetId ? 'selected' : ''} key={asset.assetId} onClick={() => setSelectedAsset(asset.assetId)}><span><b>{asset.name}</b><small>{asset.assetId}</small></span><em>{asset.currency}</em></button>)}</div></aside><section className="detail-pane"><div className="section-head"><div><span className="eyebrow">{quote.asset?.market} / {quote.asset?.currency}</span><h2>{quote.asset?.name || '资产行情'}</h2></div><div className="chip-row"><Button onClick={() => onPolicy('auto')} disabled={busy === 'source-policy'}>Auto</Button><Button onClick={() => onPolicy('pinned')} disabled={busy === 'source-policy'}>Pin fixture</Button><Button variant="primary" onClick={onWatchlist} disabled={busy === 'watchlist'}>加入自选</Button></div></div>{row && <><div className="quote-line"><strong>{formatNumber(row.price)}</strong><span className={row.price >= row.previousClose ? 'up' : 'down'}>{percent(row.price / row.previousClose - 1)}</span><Status state={quote.snapshot.stale ? 'stale' : quote.snapshot.quality?.status} /></div><div className="ohlc"><span>开 {formatNumber(row.open)}</span><span>高 {formatNumber(row.high)}</span><span>低 {formatNumber(row.low)}</span><span>量 {compactNumber(row.volume)}</span></div><Spark rows={quote.snapshot.rows} /></>}<h3>来源矩阵（A / HK）</h3><div className="table-wrap"><table><thead><tr><th>市场</th><th>数据集</th><th>Provider</th><th>状态</th><th>原因</th></tr></thead><tbody>{capabilities.cells.map((cell: Json, index: number) => <tr key={`${cell.market}-${cell.dataset}-${cell.provider}-${index}`}><td>{cell.market}</td><td>{cell.dataset}</td><td>{cell.provider}</td><td><Status state={cell.status} /></td><td>{cell.reason}</td></tr>)}</tbody></table></div></section></div>; }
function Research({ selected, dossier, lists, onSelect }: Json) { return <div className="stack"><section className="band"><div><span className="eyebrow">{selected?.assetId}</span><h2>{selected?.name || '研究底稿'}</h2></div><div className="chip-row">{lists.watchlists?.[0]?.assets?.map((asset: Json) => <button key={asset.assetId} onClick={() => onSelect(asset.assetId)}>{asset.name}</button>)}</div></section><section className="records">{dossier.records?.length ? dossier.records.map((record: Json) => <article key={record.evidence.evidenceId}><div><Status state={record.quality} /><small>{record.dataset} / {record.period}</small></div><h3>{record.title}</h3><dl><dt>取得时间</dt><dd>{dateTime(record.evidence.acquiredAt)}</dd><dt>适用时间</dt><dd>{dateTime(record.evidence.applicableAt)}</dd><dt>Hash</dt><dd className="mono">{record.evidence.contentHash.slice(0,16)}</dd></dl>{record.limitations.map((item: string) => <p className="limitation" key={item}>{item}</p>)}</article>) : <Empty text="当前资产没有证据记录" />}</section></div>; }
function Portfolio({ portfolio, ledgerText, setLedgerText, preview, onPreview, onCommit, busy }: Json) { return <div className="stack"><section className="metrics">{portfolio.totalsByCurrency.map((total: Json) => <Metric key={total.currency} label={`${total.currency} 市值`} value={formatNumber(total.marketValue)} detail={`P&L ${formatNumber(total.unrealizedPnl)}`} />)}</section><section className="band vertical"><div><h2>持仓</h2></div><div className="table-wrap"><table><thead><tr><th>资产</th><th>股数</th><th>成本</th><th>市值</th><th>P&L</th><th>状态</th></tr></thead><tbody>{portfolio.positions.map((item: Json) => <tr key={item.assetId}><td>{item.assetId}</td><td>{item.quantity}</td><td>{formatNumber(item.cost)}</td><td>{formatNumber(item.marketValue)}</td><td>{formatNumber(item.unrealizedPnl)}</td><td><Status state={item.status} /></td></tr>)}</tbody></table></div></section><section className="editor"><h2>账本导入</h2><textarea value={ledgerText} onChange={(event) => setLedgerText(event.currentTarget.value)} aria-label="账本 JSON" /><div className="editor-actions"><Button onClick={onPreview} disabled={busy === 'ledger-preview'}>预览</Button><Button variant="primary" onClick={onCommit} disabled={!preview || busy === 'ledger-commit'}>确认写入</Button></div>{preview && <p>{preview.rows?.length || 0} 行可写入，{preview.errors?.length || 0} 个错误</p>}</section></div>; }
function Quant({ strategies, backtests, experimental, setExperimental, confirmed, setConfirmed, onSave, onRun, busy }: Json) { const last = backtests.at(-1); return <div className="stack"><section className="band"><div><h2>策略定义</h2><p>{strategies.length} 个不可变版本</p></div><Button onClick={onSave} disabled={busy === 'strategy'}>保存示例策略</Button></section><section className="quant-grid"><div><h3>最近策略</h3>{strategies.at(-1) ? <pre>{JSON.stringify(strategies.at(-1), null, 2)}</pre> : <Empty text="尚无策略" />}</div><div><h3>回测门禁</h3><dl className="assumptions">{Object.entries(BACKTEST_ASSUMPTIONS).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><label className="toggle"><Switch checked={experimental} onChange={setExperimental} label="允许明确标注的实验 fixture" /><span>允许实验 fixture</span></label><label className="toggle"><Switch checked={confirmed} onChange={setConfirmed} label="已审核回测规则、数据覆盖和成本假设" /><span>已审核以上假设与数据覆盖</span></label><Button variant="primary" onClick={onRun} disabled={!strategies.length || !confirmed || busy === 'backtest'}>运行回测</Button>{last && <div className="result"><b>{percent(last.metrics.netReturn)}</b><span>净收益</span><small>最大回撤 {percent(last.metrics.maxDrawdown)}</small><Status state={last.quality} /></div>}</div></section></div>; }
function Automation({ monitors, tasks, selected, onCreate, onAction, onCreateTask, onTaskAction, busy }: Json) { return <div className="stack"><section className="band"><div><h2>监控与定时研究</h2><p>{selected?.name || selected?.assetId}</p></div><div className="chip-row"><Button onClick={onCreateTask} disabled={busy === 'research-task'}>确认创建每日研究</Button><Button variant="primary" onClick={onCreate} disabled={busy === 'monitor'}>确认创建 +2% 监控</Button></div></section><section className="task-list">{monitors.map((item: Json) => <article key={item.id}><div><b>行情监控 / {item.assetId}</b><Status state={item.status} /></div><p>{item.condition} {formatNumber(item.threshold)} / {item.intervalSeconds}s / cooldown {item.cooldownSeconds}s</p><small>{item.lastObservation?.reason || '等待 TaskRegistry 调度'}</small><div className="chip-row"><Button onClick={() => onAction(item.id, item.status === 'paused' ? 'resume' : 'pause')}>{item.status === 'paused' ? '恢复' : '暂停'}</Button><Button onClick={() => onAction(item.id, 'retry')}>重试</Button><Button onClick={() => onAction(item.id, 'cancel')}>请求取消</Button></div></article>)}{tasks.map((item: Json) => <article key={item.id}><div><b>定时研究 / {item.assetId}</b><Status state={item.status} /></div><p>Run {item.runId} / {item.intervalSeconds}s / checkpoint {item.checkpoint?.sequence || 0}</p><small>来源清单 {item.sourceManifest?.hash?.slice(0,16)} / {item.recoveryReason || '等待 TaskRegistry 调度'}</small><div className="chip-row"><Button onClick={() => onTaskAction(item.id, item.status === 'paused' ? 'resume' : 'pause')}>{item.status === 'paused' ? '恢复' : '暂停'}</Button><Button onClick={() => onTaskAction(item.id, 'retry')}>重试</Button><Button onClick={() => onTaskAction(item.id, 'cancel')}>请求取消</Button></div></article>)}{!monitors.length && !tasks.length && <Empty text="尚无监控或定时研究任务" />}</section></div>; }
function Agent({ selected, result, onRun, busy }: Json) { return <div className="stack"><section className="band"><div><h2>Agent 研究</h2><p>{selected?.name} / 公开证据 / 确定性模式</p></div><Button variant="primary" onClick={onRun} disabled={busy === 'agent'}>运行公开研究</Button></section><section className="consent-grid"><div><h3>当前边界</h3><ul><li>AI 默认关闭</li><li>私有字段逐 run 授权</li><li>模型外发逐字段预览</li><li>交易意图永久拒绝</li></ul></div><div><h3>研究结果</h3>{result ? <><p>{result.output}</p><div className="chip-row">{result.evidenceIds.map((value: string) => <span key={value}>{value.slice(0,18)}</span>)}</div><small>{result.disclaimer}</small></> : <Empty text="尚无 Agent 运行" />}</div></section></div>; }
function Exchange({ preview, onPreview, busy }: Json) { return <div className="stack"><section className="band"><div><h2>导入导出</h2><p>SessionFile / ResourceIO / 版本化 schema</p></div><Button variant="primary" onClick={onPreview} disabled={busy === 'export'}>预览 JSON 导出</Button></section>{preview ? <section className="manifest"><dl><dt>Preview ID</dt><dd className="mono">{preview.previewId}</dd><dt>格式</dt><dd>{preview.format}</dd><dt>字段数</dt><dd>{preview.fieldCount}</dd><dt>隐私</dt><dd>{preview.privacy}</dd><dt>Digest</dt><dd className="mono">{preview.digest}</dd></dl><p>文件交付由 Agent 导出工具通过 SessionFile 完成。</p></section> : <Empty text="选择导出后先预览字段、目标与隐私范围" />}</div>; }
function Diagnostics({ diagnostics, capabilities }: Json) { const byok = capabilities.cells.find((cell: Json) => cell.market === 'A' && cell.dataset === 'quote' && cell.provider === 'hithink-rest'); return <div className="stack"><section className="metrics"><Metric label="审计事件" value={String(diagnostics.events.length)} detail={`revision ${diagnostics.revision || 0}`} /><Metric label="研究运行" value={String(diagnostics.counts.researchRuns || 0)} detail="redacted" /><Metric label="回测" value={String(diagnostics.counts.backtests || 0)} detail="immutable" /><Metric label="本地源" value="Blocked" detail="prototype gate" /></section><section className="audit"><h2>最近事件</h2>{diagnostics.events.map((event: Json) => <div key={event.id}><time>{dateTime(event.at)}</time><b>{event.action}</b><span>{event.actor}</span></div>)}</section><section className="notice"><strong>同花顺 BYOK</strong><span>{byok?.authentication || 'missing'}</span><p>{byok?.reason}。Key 与 AI 开关仅能在宿主插件设置中修改；AI 默认关闭。</p></section><section className="notice"><strong>Provider 单元</strong><span>{capabilities.cells.length}</span><p>敏感配置与未授权原始数据不会进入诊断输出。</p></section></div>; }
function Widget({ status, quote, portfolio, monitors, loading }: Json) { const row = quote.snapshot?.rows?.[0]; return <div className="widget"><header><h1>Finance</h1><Status state={loading ? 'loading' : quote.snapshot?.stale ? 'stale' : 'ready'} /></header><section><span>{quote.asset?.name || '加载中'}</span><strong>{row ? formatNumber(row.price) : '--'}</strong><small>{row ? percent(row.price / row.previousClose - 1) : ''}</small></section><div className="widget-grid"><Metric label="持仓" value={String(portfolio.positions?.length || 0)} detail="local" /><Metric label="任务" value={String(monitors.length)} detail="scheduled" /></div><footer>{status.marketDump?.status || 'blocked'} local source</footer></div>; }
function Metric({ label, value, detail }: Json) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function Status({ state }: { state: string }) { return <span className={`status ${state || 'unknown'}`}>{state || 'unknown'}</span>; }
function StatusStrip({ counts }: Json) { return <div className="status-strip">{Object.entries(counts).map(([key,value]) => <span key={key}><i className={key} />{key} {String(value)}</span>)}</div>; }
function Spark({ rows }: Json) { const values = rows.length > 1 ? rows.map((item: Json) => item.close) : [rows[0]?.low, rows[0]?.open, rows[0]?.price, rows[0]?.high].filter(Boolean); const min = Math.min(...values), max = Math.max(...values); return <div className="spark" aria-label="价格范围图">{values.map((value: number,index: number) => <i key={index} style={{height:`${20 + ((value-min)/(max-min || 1))*70}%`}} />)}</div>; }
function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function json(value: unknown): RequestInit { return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }; }
function formatNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(number) : '--'; }
function compactNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) ? new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(number) : '--'; }
function percent(value: unknown) { const number = Number(value); return Number.isFinite(number) ? `${number >= 0 ? '+' : ''}${(number*100).toFixed(2)}%` : '--'; }
function dateTime(value: unknown) { const date = new Date(String(value)); return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN',{hour12:false}) : '--'; }
const root = document.getElementById('root'); if (root) createRoot(root).render(<Panel />);
