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
    requestModifiers: [
        {
            pattern: '^https://example.org/$',
            name: 'User-Agent',
            value: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
            enable: true
        }
    ],
    responseModifiers: [
        {
            pattern: '^https://example.org/$',
            name: 'abc',
            value: '123',
            enable: true
        }
    ],
    setting: {
        enable_proxy: true,
        refresh_after_switch: true,
        enable_for_extension: true,
        enable_modifier: false,
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
    activeTab: { id: -1, url: '', currentProxy: '', currentActive: null },
    iconState: 'NORMAL'
};

function updateIcon() {
    browser.tabs
        .query({ active: true, currentWindow: true })
        .then(tabs => {
            const activeTab = tabs[0];
            log.log('updateIcon() activeTab:', activeTab);
            let currentProxy;
            if (activeTab.url.startsWith('about:')) {
                currentProxy =
                    g.data.active.type === 'proxy'
                        ? g.data.active.name
                        : g.data.profiles[g.data.active.name].defaultProxy;
            } else {
                currentProxy = getProxyByUrl(activeTab.url).proxyName;
            }
            const iconState = currentProxy === 'direct' ? 'NORMAL' : 'ACTIVE';
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

function tabUpdateHandler(tabId, changeInfo, tabInfo) {
    if (tabInfo.active === true && changeInfo.status) {
        if (changeInfo.status === 'complete' || (changeInfo.status === 'loading' && changeInfo.url)) {
            updateIcon();
        }
    }
}

function proxyHandler(requestInfo) {
    log.log('proxyHandler(requestInfo)', requestInfo);

    let url;
    let proxyInfo;

    if (requestInfo.documentUrl) {
        if (requestInfo.documentUrl.startsWith('about:')) {
            url = requestInfo.url;
        } else {
            url = requestInfo.documentUrl;
        }
    } else {
        url = requestInfo.url;
    }

    proxyInfo = getProxyByUrl(url).proxyInfo;

    return proxyInfo;
}

function getProxyByUrl(url) {
    let proxyName = 'direct';
    if (url.startsWith('moz-ext') && g.data.setting.enable_for_extension === false) {
        // for extension
        proxyName = 'direct';
    } else if (g.data.active.type === 'proxy') {
        // using proxy
        proxyName = g.data.active.name;
    } else {
        // using profile
        const profile = g.data.profiles[g.data.active.name];
        const host = new URL(url).host;
        let matchedLength = 0;

        for (let rule of profile.rules) {
            if (host === rule.host) {
                // fully match
                matchedLength = rule.host.length;
                proxyName = rule.proxyName;
                break;
            } else if (host.endsWith(rule.host) && rule.host.length > matchedLength) {
                // partial match, longer rule host has higher priority
                matchedLength = rule.host.length;
                proxyName = rule.proxyName;
            }
        }

        if (matchedLength === 0) {
            proxyName = profile.defaultProxy;
        }
    }

    const result = {
        proxyName: proxyName,
        proxyInfo: g.data.proxies[proxyName]
    };

    log.log('getProxyByUrl(): ', url, result);

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

function applyRequestModifiers(requestDetail) {
    const url = requestDetail.url;
    const headers = requestDetail.requestHeaders;

    for (let modifier of g.data.requestModifiers) {
        if (modifier.enable && new RegExp(modifier.pattern).test(url)) {
            const i = headers.findIndex(item => item.name.toLowerCase() === modifier.name.toLowerCase());
            if (i === -1) {
                // header not exist
                headers.push({ name: modifier.name, value: modifier.value });
            } else if (modifier.value === '') {
                // delete header
                headers.splice(i, 1);
            } else {
                // change value
                headers[i].value = modifier.value;
            }
        }
    }

    return { requestHeaders: headers };
}

function applyResponseModifiers(responseDetail) {
    const url = responseDetail.url;
    const headers = responseDetail.responseHeaders;

    for (let modifier of g.data.responseModifiers) {
        if (modifier.enable && new RegExp(modifier.pattern).test(url)) {
            const i = headers.findIndex(item => item.name.toLowerCase() === modifier.name.toLowerCase());
            if (i === -1) {
                // header not exist
                headers.push({ name: modifier.name, value: modifier.value });
            } else if (modifier.value === '') {
                // delete header
                headers.splice(i, 1);
            } else {
                // change value
                headers[i].value = modifier.value;
            }
            console.log(headers);
        }
    }

    return { responseHeaders: headers };
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
            console.log(msg.data);
            g.data = msg.data;
            switchListeners();
            storage.set(g.data).then(sendResponse);
            break;
        case 'resetData':
            g.data = defaultData;
            switchListeners();
            storage.set(defaultData).then(sendResponse);
            break;
        case 'getActiveTab':
            sendResponse(g.activeTab);
            break;
        default:
            log.warn('msgHandler(), unknow msg:', msg);
            break;
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

    // switch listeners
    switchListeners();

    // handle msg
    browser.runtime.onMessage.addListener(msgHandler);

    console.log('Shuffle started ^_^');
}

main();

function switchListeners() {
    const setting = g.data.setting;
    const proxyEnabled = browser.proxy.onRequest.hasListener(proxyHandler) ? true : false;
    const modifierEnabled = browser.webRequest.onBeforeSendHeaders.hasListener(applyRequestModifiers) ? true : false;
    const loggingEnabled = browser.proxy.onError.hasListener(proxyErrorHandler) ? true : false;

    // switch proxy handler
    if (setting.enable_proxy === true && proxyEnabled === false) {
        // proxy on
        browser.proxy.onRequest.addListener(proxyHandler, { urls: ['<all_urls>'] });
        browser.webRequest.onAuthRequired.addListener(proxyAuthHandler, { urls: ['<all_urls>'] }, ['blocking']);
        // use different icon to indicate proxy state
        browser.tabs.onUpdated.addListener(tabUpdateHandler);
        browser.tabs.onActivated.addListener(updateIcon);
        browser.windows.onFocusChanged.addListener(updateIcon);
        updateIcon();
    } else if (setting.enable_proxy === false && proxyEnabled === true) {
        // proxy off
        browser.proxy.onRequest.removeListener(proxyHandler);
        browser.webRequest.onAuthRequired.removeListener(proxyAuthHandler);
        // disable dynamic toolbar icon
        browser.tabs.onUpdated.removeListener(tabUpdateHandler);
        browser.tabs.onActivated.removeListener(updateIcon);
        browser.windows.onFocusChanged.removeListener(updateIcon);
        browser.browserAction.setIcon(icon['NORMAL']);
    }

    // switch request & response header modifier
    if (setting.enable_modifier === true && modifierEnabled === false) {
        // modifier on
        browser.webRequest.onBeforeSendHeaders.addListener(applyRequestModifiers, { urls: ['<all_urls>'] }, [
            'blocking',
            'requestHeaders'
        ]);
        browser.webRequest.onHeadersReceived.addListener(applyResponseModifiers, { urls: ['<all_urls>'] }, [
            'blocking',
            'responseHeaders'
        ]);
    } else if (setting.enable_modifier === false && modifierEnabled === true) {
        // modifier off
        browser.webRequest.onBeforeSendHeaders.removeListener(applyRequestModifiers);
        browser.webRequest.onHeadersReceived.removeListener(applyResponseModifiers);
    }

    // switch error logger
    if (setting.enable_logging === true && loggingEnabled === false) {
        // logger on
        browser.proxy.onError.addListener(proxyErrorHandler);
        browser.webRequest.onErrorOccurred.addListener(webRequestErrorHandler, { urls: ['<all_urls>'] });
    } else if (setting.enable_logging === false && loggingEnabled === true) {
        // logger off
        browser.proxy.onError.removeListener(proxyErrorHandler);
        browser.webRequest.onErrorOccurred.removeListener(webRequestErrorHandler);
    }
}
