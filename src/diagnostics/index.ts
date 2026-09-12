// Provider diagnostics — pure logic for verifying that an external provider is reachable and
// answering in the shape the pipeline expects. Nothing here opens a socket; the scripts that
// use it do. That split is what makes the failure taxonomy testable offline.

export {
  classifyHttpFailure,
  classifySleeperFailure,
  summarizeChecks,
  validateSleeperPlayers,
  validateSleeperTrending,
  type SleeperCheck,
  type SleeperClassification,
  type SleeperVerificationSummary,
  type ValidationVerdict,
} from './sleeperVerification';
