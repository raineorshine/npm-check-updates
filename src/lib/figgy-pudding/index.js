/* eslint-disable */

/*

This is stripped down version of the deprecated figgy-pudding. It is used by libnpmconfig, which is also deprecated and has been brought into the codebase to avoid deprecation warnings.

https://github.com/npm/figgy-pudding

*/

class FiggyPudding {
  constructor(specs, opts, providers) {
    this.__specs = specs || {}
    this.__opts = opts || {}
    this.__providers = reverse(providers.filter(x => x != null && typeof x === 'object'))
    this.__isFiggyPudding = true
  }
  get(key) {
    return pudGet(this, key, true)
  }
  toJSON() {
    const obj = {}
    this.forEach((val, key) => {
      obj[key] = val
    })
    return obj
  }
  forEach(fn, thisArg = this) {
    for (let [key, value] of this.entries()) {
      fn.call(thisArg, value, key, this)
    }
  }
  *entries(_matcher) {
    for (let key of Object.keys(this.__specs)) {
      yield [key, this.get(key)]
    }
    const matcher = _matcher || this.__opts.other
    if (matcher) {
      const seen = new Set()
      for (let p of this.__providers) {
        const iter = p.entries ? p.entries(matcher) : entries(p)
        for (let [key, val] of iter) {
          if (matcher(key) && !seen.has(key)) {
            seen.add(key)
            yield [key, val]
          }
        }
      }
    }
  }
  concat(...moreConfig) {
    return new Proxy(
      new FiggyPudding(this.__specs, this.__opts, reverse(this.__providers).concat(moreConfig)),
      proxyHandler,
    )
  }
}

function pudGet(pud, key, validate) {
  let spec = pud.__specs[key]
  if (!spec) {
    spec = {}
  }
  let ret
  for (let p of pud.__providers) {
    ret = tryGet(key, p)
    if (ret !== undefined) {
      break
    }
  }
  if (ret === undefined && spec.default !== undefined) {
    if (typeof spec.default === 'function') {
      return spec.default(pud)
    } else {
      return spec.default
    }
  } else {
    return ret
  }
}

function tryGet(key, p) {
  let ret
  if (p.__isFiggyPudding) {
    ret = pudGet(p, key, false)
  } else {
    ret = p[key]
  }
  return ret
}

const proxyHandler = {
  get(obj, prop) {
    if (typeof prop === 'symbol' || prop.slice(0, 2) === '__' || prop in FiggyPudding.prototype) {
      return obj[prop]
    }
    return obj.get(prop)
  },
}

function figgyPudding(specs, opts) {
  function factory(...providers) {
    return new Proxy(new FiggyPudding(specs, opts, providers), proxyHandler)
  }
  return factory
}

function reverse(arr) {
  const ret = []
  arr.forEach(x => ret.unshift(x))
  return ret
}

function entries(obj) {
  return Object.keys(obj).map(k => [k, obj[k]])
}

export default figgyPudding