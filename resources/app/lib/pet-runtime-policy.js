/** Pet-only composition. Keep execution, storage, credentials and transport foundations. */
export const REMOVED_CORE_IDS = new Set([
  'session-title-llm','session-log-deepseek','plugin-package-inventory-deepseek',
  'deepseek-account','llm-deepseek','llm-deepseek-account',
  'session-query-sqlite','session-projection-cache','session-telemetry-otel',
  'tool-working-directory','tool-plugin-manager','tool-bash','tool-pwsh','tool-jobs','jobs',
  'agent-instructions','skill','skill-filesystem','tool-skill','command-feedback',
  'goal','goal-round-driver','command-goal','plan-mode','command-compact',
  'subagent','subagent-spawn-in-process','subagent-fork-in-process',
  'tool-subagent-control','tool-subagent-list-agents','tool-subagent','tool-subagent-fork',
  'ptc-runtime','workflow-ptc','tool-workflow','tool-todo','tool-goal',
  'web','web-search-deepseek','web-deepseek-api','web-fetch-http','tool-web','mcp-resources',
])
export const WEB_FOUNDATION_IDS = new Set([
  'web-startup','webserver','web-runtime','modules','connection','client-hmr',
  'ui-renderer','api-remotes','settings-controller','ui-theme','ui-settings','locale','shortcuts',
])
export const REMOVED_DESKTOP_IDS = new Set([
  'desktop-terminal','desktop-diagnostics','desktop-notifications','desktop-pnpm',
  'desktop-profiles','desktop-updates','desktop-directory-picker-browse-host',
  'desktop-directory-picker-browse-surface','directory-picker',
])
export const isRemovedPetEntry = row => !WEB_FOUNDATION_IDS.has(row.id) && (REMOVED_CORE_IDS.has(row.id) || REMOVED_DESKTOP_IDS.has(row.id)
  || /^(ui-|preset-)/.test(row.id || '') && !WEB_FOUNDATION_IDS.has(row.id)
  || ['community-market','dsh-market','agents-anywhere-bridge-next','desktop-product-telemetry','product-analytics',
    'subagent-model-selection-settings','message-feedback','session-log-download','open-in-app','workspace',
    'session-reference','file-reference-local','session-stats','session-turn-outline','plugin-inventory',
    'session-controller','job-controller','terminal-controller','workspace-files','schedule','account-controller',
    'workspace-controller','cordis-host-runner','cordis-inspect-providers','harness-dev-context',
    'file-upload','cordis-client-runner','locale','shortcuts','resources','office-to-pdf','workspace-changes',
    'agent-preset-registry'].includes(row.id))

export function petDesktopEntries(rows) {
  return rows.filter(row => !isRemovedPetEntry(row)).map(row => {
    // These values are deployment policy; stale original settings cannot reactivate removed UI.
    if(row.id==='desktop-shell')return {...row,config:{...row.config,networkExposure:'loopback',openBrowser:false}}
    return row
  })
}
