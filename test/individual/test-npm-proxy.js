'use strict';
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const mockRequire = require('mock-require');
const ProxyAgent = require('https-proxy-agent');

const npmProxyPath = '../../lib/package-managers/npm-proxy';

describe('npm proxy', () => {
    it('no proxy set', () => {
        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('proxy set', () => {
        process.env.HTTPS_PROXY = 'http://localhost';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.an.instanceOf(ProxyAgent);
    });

    it('proxy set but default npm registry listed in no_proxy', () => {
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = 'example.com,registry.npmjs.org';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('proxy set but default npm registry listed in no_proxy as wildcard', () => {
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = '*.npmjs.org';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('proxy set but default npm registry listed in no_proxy as npm-like wildcard', () => {
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = 'npmjs.org';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('proxy set but default npm registry listed in no_proxy as matching subdomain', () => {
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = '.npmjs.org';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('proxy set but custom npm registry with port listed in no_proxy', () => {
        mockRequire('registry-url', () => 'http://localhost:123');
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = 'localhost:123';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('no_proxy should exactly match the hostname', () => {
        mockRequire('registry-url', () => 'http://myregistry');
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = 'registry';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.an.instanceOf(ProxyAgent);
    });

    it('no_proxy should work with ipv6', () => {
        mockRequire('registry-url', () => 'http://[::1]');
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = '::1';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.null;
    });

    it('no_proxy should work with registry urls for scoped packages', () => {
        const registryUrlStub = sinon.stub().returns('http://registry');
        registryUrlStub.withArgs('@scoped').returns('https://scoped.registry');
        mockRequire('registry-url', registryUrlStub);
        process.env.HTTPS_PROXY = 'http://localhost';
        process.env.NO_PROXY = 'scoped.registry';

        const {getProxyAgent} = mockRequire.reRequire(npmProxyPath);

        expect(getProxyAgent()).to.be.an.instanceOf(ProxyAgent);
        expect(getProxyAgent('@scoped')).to.be.null;
    });

    afterEach(() => {
        mockRequire.stopAll();
        delete process.env.HTTPS_PROXY;
        delete process.env.NO_PROXY;
    });
});
