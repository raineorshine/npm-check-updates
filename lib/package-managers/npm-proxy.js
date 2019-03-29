const url          = require('url');
const ProxyAgent   = require('https-proxy-agent');
const npmConf      = require('npm-conf')();
const proxyUrl     = require('get-proxy')();
const registryUrl  = require('registry-url');

const mainRegistryUrl = registryUrl();

let proxyAgent;
let noProxy = false;
let noProxyEnv;
let noProxyRegExps;

const noProxyRegExpCheck = (parsedUrl) => {
    for (const regExp of noProxyRegExps) {
        if (regExp.test(parsedUrl.hostname) || regExp.test(parsedUrl.host)) {
            return true;
        }
    }
    return false;
};

const noProxyCheck = (scope) => {
    if (!noProxyEnv) {
        return false;
    }
    if (noProxyEnv === '*') {
        return true;
    }
    if (!scope) {
        return noProxy;
    }
    const scopedRegistryUrl = registryUrl(scope);
    if (scopedRegistryUrl === mainRegistryUrl) {
        return noProxy;
    }
    const parsedRegistryUrl = global.URL ? new URL(scopedRegistryUrl) : url.parse(scopedRegistryUrl);
    return noProxyRegExpCheck(parsedRegistryUrl);
};

if (proxyUrl) {
    const proxy = global.URL ? new URL(proxyUrl) : url.parse(proxyUrl);
    proxyAgent = new ProxyAgent({
        host: proxy.hostname,
        port: proxy.port,
        auth: global.URL ? proxy.username + (proxy.password ? ':' + proxy.password : '') : proxy.auth,
        secureProxy: proxy.protocol === 'https:',
        keepAlive: true,
        maxSockets: npmConf.get('maxsockets'),
        ca: npmConf.get('ca'),
        key: npmConf.get('key'),
        cert: npmConf.get('cert'),
        rejectUnauthorized: npmConf.get('strict-ssl')
    });

    // The NO_PROXY environment variable specifies URLs that should be excluded from proxying.
    // Generate regular expressions for each NO_PROXY url, test them against the main registry url
    // and potentially test them against registry urls for scoped packages later.
    //
    // See also (since there's no RFC):
    // - https://curl.haxx.se/libcurl/c/CURLOPT_NOPROXY.html
    // - https://www.gnu.org/software/emacs/manual/html_node/url/Proxies.html
    noProxyEnv = process.env.NO_PROXY || process.env.no_PROXY || process.env.no_proxy;
    if (noProxyEnv && noProxyEnv !== '*') {
        noProxyRegExps = noProxyEnv.split(/\s*,\s*/).map(np => {
            np = np.replace(/\./g, '\\.').replace(/\*/g, '.*');
            if (!np.startsWith('\\.')) {
                // Add optional square bracket checks for IPv6 support
                np = `^\\[?${np}\\]?`;
            }
            np = `${np}$`;
            return new RegExp(np, 'i');
        });

        const parsedRegistryUrl = global.URL ? new URL(mainRegistryUrl) : url.parse(mainRegistryUrl);
        noProxy = noProxyRegExpCheck(parsedRegistryUrl);
    }
}

const getProxyAgent = (scope) => {
    if (!proxyAgent || noProxyCheck(scope)) {
        return null;
    }
    return proxyAgent;
};

module.exports = {
    getProxyAgent
};
