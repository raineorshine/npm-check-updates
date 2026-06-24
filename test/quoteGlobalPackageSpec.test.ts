import quoteGlobalPackageSpec from '../src/lib/quoteGlobalPackageSpec'

describe('quoteGlobalPackageSpec', () => {
  it('quote scoped specs whose scope contains a period', () => {
    quoteGlobalPackageSpec('@bomb.sh/tab@0.0.16').should.equal('"@bomb.sh/tab@0.0.16"')
  })

  it('do not quote scoped specs without a period in the scope', () => {
    quoteGlobalPackageSpec('@github/copilot@1.0.61').should.equal('@github/copilot@1.0.61')
    quoteGlobalPackageSpec('@google/gemini-cli@0.45.3').should.equal('@google/gemini-cli@0.45.3')
    quoteGlobalPackageSpec('@anthropic-ai/claude-agent-sdk@0.3.170').should.equal(
      '@anthropic-ai/claude-agent-sdk@0.3.170',
    )
  })

  it('do not quote unscoped specs', () => {
    quoteGlobalPackageSpec('prettier@3.8.4').should.equal('prettier@3.8.4')
    quoteGlobalPackageSpec('electron@42.4.0').should.equal('electron@42.4.0')
  })

  it('do not quote unscoped specs even when the name contains a period', () => {
    quoteGlobalPackageSpec('lodash.merge@4.6.2').should.equal('lodash.merge@4.6.2')
  })
})
