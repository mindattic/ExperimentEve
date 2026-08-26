# CliHook: drain the Prose Hub outbox for consumer 'eve' and inject anything
# pending into this session's context. Silent no-op when the Hub is down or
# the endpoint doesn't exist yet (RFC 0007 in the Prose repo builds it).
$ErrorActionPreference = 'SilentlyContinue'
try {
    $resp = Invoke-RestMethod -Uri 'http://127.0.0.1:5900/api/outbox/eve' -Method Get -TimeoutSec 2
    if ($null -ne $resp -and $resp.Count -gt 0) {
        Write-Output '[PROSE HUB → EVE] Pending events from the Prose universe repository:'
        foreach ($e in $resp) {
            $line = "  - [$($e.kind)] $($e.summary)"
            if ($e.ts) { $line = "  - $($e.ts) [$($e.kind)] $($e.summary)" }
            Write-Output $line
        }
        Write-Output '[PROSE HUB → EVE] (Act on these if relevant: e.g. pull the universe snapshot or barks.)'
    }
} catch { }
exit 0
