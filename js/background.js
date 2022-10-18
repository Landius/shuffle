// const
const defaultData = {
    active: { type: 'profile', name: 'example' },
    proxies: {
        direct: { type: 'direct' },
        socks: {
            type: 'socks',
            host: '127.0.0.1',
            port: 6666,
            proxyDNS: true
        }
    },
    profiles: {
        example: {
            defaultProxy: 'direct',
            rules: [{ host: 'example.com', proxyName: 'direct' }]
        }
    },
    setting: {
        enable_proxy: true,
        refresh_after_switch: true,
        enable_for_extension: true,
        enable_logging: false
    }
};
const storage = browser.storage.sync;
const icon = {
    NORMAL: { path: 'img/icon.png' },
    ACTIVE: { path: 'img/icon_filled.png' }
};

// global variables
const g = {
    data: null,
    activeTab: { id: -1, url: '', currentProxy: null, currentActive: null },
    iconState: 'NORMAL'
};

function updateIcon() {
    // const winId = browser.windows.WINDOW_ID_CURRENT;
    browser.tabs
        .query({ active: true, currentWindow: true })
        .then(tabs => {
            const activeTab = tabs[0];
            const currentProxy = getProxyByUrl(activeTab.url);
            const iconState = currentProxy.proxyName === 'direct' ? 'NORMAL' : 'ACTIVE';
            if (g.iconState !== iconState) {
                browser.browserAction.setIcon(icon[iconState]);
                g.iconState = iconState;
            }
            g.activeTab.id = activeTab.id;
            g.activeTab.url = activeTab.url;
            g.activeTab.currentProxy = currentProxy;
            g.activeTab.currentActive = g.data.active;
        })
        .catch(err => log.error(err));
}

function proxyHandler(requestInfo) {
    log.log('proxyHandler(requestInfo)', requestInfo);

    let proxyInfo;
    if (requestInfo.documentUrl?.startsWith('moz-extension://') && g.data.setting.enable_for_extension === false) {
        // don't forward request from extension
        proxyInfo = g.data.proxies['direct'];
    } else if (g.data.active.type === 'proxy') {
        // use proxy
        proxyInfo = g.data.proxies[g.data.active.name];
    } else {
        // use profile
        let url = requestInfo.documentUrl || requestInfo.url;
        proxyInfo = getProxyByUrl(url).proxyInfo;
    }

    return proxyInfo;
}

function getProxyByUrl(url) {
    const profile = g.data.profiles[g.data.active.name];
    const host = new URL(url).host;
    const ret = {
        // store search result
        hostLength: 0,
        proxyName: profile.defaultProxy
    };

    for (let rule of profile.rules) {
        if (host === rule.host) {
            // fully match
            ret.proxyName = rule.proxyName;
            break;
        } else if (host.endsWith(rule.host) && rule.host.length > ret.hostLength) {
            // partial match, long rule host has higher priority
            ret.proxyName = rule.proxyName;
        }
    }

    const result = {
        proxyName: ret.proxyName,
        proxyInfo: g.data.proxies[ret.proxyName]
    };

    log.log('getProxyByUrl(): url, result=', url, result);

    return result;
}

function proxyAuthHandler(requestDetail) {
    let blockResponse = null;
    if (requestDetail.isProxy && requestDetail.proxyInfo.type.includes('http')) {
        for (let proxy of g.data.proxies) {
            if (
                proxy.type === requestDetail.proxyInfo.type &&
                proxy.host === requestDetail.proxyInfo.host &&
                proxy.port === requestDetail.proxyInfo.port
            ) {
                blockResponse = {
                    authCredentials: { username: proxy.username, password: proxy.password }
                };
            }
        }
    } else {
        blockResponse = { cancel: true };
        log.warn('proxyAuthHandler(), credentials not found.');
    }
    return blockResponse;
}

function proxyErrorHandler(error) {
    log.error('proxy.onError: ', error);
}

function webRequestErrorHandler(error) {
    log.error('webRequest.onErrorOccurred: ', error);
}

function msgHandler(msg, sender, sendResponse) {
    switch (msg.cmd) {
        case 'getData':
            sendResponse(g.data);
            break;
        case 'setData':
            g.data = msg.data;
            storage.set(g.data).then(sendResponse);
            break;
        case 'getActiveTab':
            sendResponse(g.activeTab);
            break;
        case 'setActive':
            g.data.active = msg.active;
            storage.set(g.data);
            updateIcon();
            refreshCurrentTab();
            break;
        case 'editRule':
            editRule(msg.rule);
            storage.set(g.data);
            updateIcon();
            refreshCurrentTab();
            sendResponse();
            break;
        default:
            log.warn('msgHandler(), unknow msg:', msg);
            break;
    }
}

function editRule(newRule) {
    const rules = g.data.profiles[g.data.active.name].rules;
    let ruleExist = false;

    for (let i = 0; i < rules.length; i++) {
        if ((rules[i].host = newRule.host)) {
            ruleExist = true;
            rules[i].proxyName = newRule.proxyName;
            break;
        }
    }

    if (ruleExist === false) {
        rules.push(newRule);
    }
}

function refreshCurrentTab(){
    if(g.activeTab.id !== -1 && g.setting.refresh_after_switch){
        browser.tabs.reload(g.activeTab.id);
    }
}

// utils
const log = {
    info: (...msg) => {
        if (g.data.setting.enable_logging) console.info('[Shuffle]', ...msg);
    },
    log: (...msg) => {
        if (g.data.setting.enable_logging) console.log('[Shuffle]', ...msg);
    },
    warn: (...msg) => {
        if (g.data.setting.enable_logging) console.warn('[Shuffle]', ...msg);
    },
    error: (...msg) => {
        // if (g.data.setting.enable_logging) console.error('[Shuffle]', ...msg);
        console.error('[Shuffle]', ...msg);
    }
};

async function main() {
    // get data from storage
    g.data = await storage.get();
    if (g.data.setting === undefined) {
        // init storage
        g.data = defaultData;
        storage.set(g.data);
    }
    // update icon
    updateIcon();
    browser.tabs.onActivated.addListener(updateIcon); // maybe use changeInfo.attention of onUpdated is better?
    browser.windows.onFocusChanged.addListener(updateIcon);

    // register proxy handler
    if (g.data.setting.enable_proxy) {
        browser.proxy.onRequest.addListener(proxyHandler, { urls: ['<all_urls>'] });
        browser.webRequest.onAuthRequired.addListener(proxyAuthHandler, { urls: ['<all_urls>'] }, ['blocking']);
    }
    // register error logger
    if (g.data.setting.enable_logging) {
        browser.proxy.onError.addListener(proxyErrorHandler);
        browser.webRequest.onErrorOccurred.addListener(webRequestErrorHandler, { urls: ['<all_urls>'] });
    }

    // handle msg
    browser.runtime.onMessage.addListener(msgHandler);

    console.log('Shuffle started ^_^');
}

main();
