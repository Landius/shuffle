import { createApp } from './lib/vue.esm-browser.prod.min.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function main() {
    const activeTab = await browser.runtime.sendMessage({ cmd: 'getActiveTab' });
    const data = await browser.runtime.sendMessage({ cmd: 'getData' });

    console.log('data loaded');

    const app = createApp({
        data() {
            let host;
            if (activeTab.url.startsWith('moz-ext')) {
                host = 'extension page';
            } else if (activeTab.url.startsWith('about:')) {
                host = 'about page';
            } else {
                const url = new URL(activeTab.url);
                host = url.host;
            }

            let status;
            if (activeTab.currentActive.type === 'profile') {
                status = activeTab.currentActive.name + ' ~ ' + activeTab.currentProxy;
            } else {
                status = activeTab.currentProxy;
            }

            let currentTable = 'info';

            return { data, activeTab, host, status, currentTable };
        },
        methods: {
            editHandler() {
                this.currentTable = 'edit';
                this.prevRule = { host: this.host, proxyName: this.activeTab.currentProxy };
            },
            saveHandler() {
                if (this.currentTable === 'edit') {
                    // edit rule or push new rule
                    const profile = this.data.profiles[this.activeTab.currentActive.name];
                    let ruleExist = false;
                    for (let rule of profile.rules) {
                        if (rule.host === this.prevRule.host && rule.proxyName === this.prevRule.proxyName) {
                            ruleExist = true;
                            rule.host = this.host;
                            rule.proxyName = this.activeTab.currentProxy;
                            break;
                        }
                    }
                    if (ruleExist === false) {
                        profile.rules.push({ host: this.host, proxyName: this.activeTab.currentProxy });
                    }
                } else if (this.currentTable === 'switch') {
                    // just save it, nothing else
                }

                this.currentTable = 'info';
                this.setData();
            },
            switchHandler() {
                this.currentTable = 'switch';
            },
            switchProxy(ev) {
                this.data.active = { name: ev.target.value, type: 'proxy' };
            },
            switchProfile(ev) {
                this.data.active = { name: ev.target.value, type: 'profile' };
            },
            optionHandler() {
                browser.tabs.create({ url: './option.html' });
                close();
            },
            setData() {
                browser.runtime
                    .sendMessage({ cmd: 'setData', data: JSON.parse(JSON.stringify(this.data)) })
                    .then(() => {
                        if (this.data.setting.refresh_after_switch) {
                            browser.tabs.reload(this.activeTab.id);
                        }
                        close();
                    });
            }
        },
        computed: {
            showEditBtn() {
                if (
                    this.activeTab.url.startsWith('moz-ext') ||
                    this.activeTab.url.startsWith('about:') ||
                    this.activeTab.currentActive.type === 'proxy' ||
                    this.currentTable !== 'info'
                ) {
                    return false;
                } else {
                    return true;
                }
            },
            showSaveBtn() {
                if (this.currentTable === 'edit' || this.currentTable === 'switch') {
                    return true;
                } else {
                    return false;
                }
            },
            showSwitchBtn() {
                if (this.currentTable === 'switch') {
                    return false;
                } else {
                    return true;
                }
            },
            activeProxy() {
                const proxyName = this.data.active.type == 'proxy' ? data.active.name : '';
                console.log(proxyName);
                return proxyName;
            },
            activeProfile() {
                const profileName = this.data.active.type == 'profile' ? data.active.name : '';
                console.log(profileName);
                return profileName;
            }
        },
        mounted() {
            $('#app').style.display = 'block';
        }
    });

    app.mount('#app');
}

main();
