import { describe, expect, it } from 'vitest'
import quoteGlobalPackageSpec from '../src/lib/quoteGlobalPackageSpec.ts'

describe('quoteGlobalPackageSpec', () => {
  it('quote scoped specs whose scope contains a period', () => {
    expect(quoteGlobalPackageSpec('@bomb.sh/tab@0.0.16')).toBe('"@bomb.sh/tab@0.0.16"')
  })

  it('do not quote scoped specs without a period in the scope', () => {
    expect(quoteGlobalPackageSpec('@github/copilot@1.0.61')).toBe('@github/copilot@1.0.61')
    expect(quoteGlobalPackageSpec('@google/gemini-cli@0.45.3')).toBe('@google/gemini-cli@0.45.3')
    expect(quoteGlobalPackageSpec('@anthropic-ai/claude-agent-sdk@0.3.170')).toBe(
      '@anthropic-ai/claude-agent-sdk@0.3.170',
    )
  })

  it('do not quote unscoped specs', () => {
    expect(quoteGlobalPackageSpec('prettier@3.8.4')).toBe('prettier@3.8.4')
    expect(quoteGlobalPackageSpec('electron@42.4.0')).toBe('electron@42.4.0')
  })

  it('do not quote unscoped specs even when the name contains a period', () => {
    expect(quoteGlobalPackageSpec('lodash.merge@4.6.2')).toBe('lodash.merge@4.6.2')
  })
})
