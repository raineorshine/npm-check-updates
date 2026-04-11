import 'chai'
import 'chai-as-promised'
import 'chai-string'

declare global {
  namespace Chai {
    // 1. Add 'eventually' for chai-as-promised
    interface Assertion extends LanguageChains, NumericComparison, TypeComparison {
      eventually: PromisedAssertion
    }

    // 2. Add 'PromisedAssertion' for the 'eventually' chain
    interface PromisedAssertion extends Eventually, Assertion {}

    // 3. Add 'containIgnoreCase' and 'startWith' for chai-string
    interface Assertion {
      containIgnoreCase(expected: string): Assertion
      startWith(expected: string): Assertion
    }
  }

  // 4. Inject 'should' into the base Object prototype
  interface Object {
    should: Chai.Assertion
  }
}
