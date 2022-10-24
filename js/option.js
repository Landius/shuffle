import { createApp } from './lib/vue.esm-browser.prod.min.js';

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

async function main() {
    const storage = browser.storage.sync;
    let storageData = await storage.get();

    const app = createApp({
        data() {
            return {
                data: storageData,
                proxyTab: {
                    currentType: '',
                    currentProxyInfo: {},
                    currentProfileInfo: {}
                }
            };
        },
        methods: {
            activeTab(ev) {
                const t = ev.target;
                if (t.classList.contains('active')) return;
                for (let span of $$('#nav>span.tab-btn')) {
                    span.classList.remove('active');
                }
                t.classList.add('active');

                const tabTitle = t.innerText;
                for (let tab of $$('#main>div.tab')) {
                    tab.classList.remove('show');
                }
                $('#' + tabTitle).classList.add('show');
            },
            showProxyDetail(ev) {
                const t = ev.target;

                if (t.tagName !== 'LI') return;

                for (let li of $$('#proxy>.left-panel li')) {
                    li.classList.remove('active');
                }
                t.classList.add('active');

                if (t.classList.contains('proxy-item')) {
                    $('#profile-editor').style.display = 'none';
                    $('#proxy-editor').style.display = 'block';
                    this.proxyTab.currentType = 'proxy';
                    this.proxyTab.currentProxyInfo = this.data.proxies[t.innerText];
                } else {
                    $('#proxy-editor').style.display = 'none';
                    $('#profile-editor').style.display = 'block';
                    this.proxyTab.currentType = 'profile';
                    this.proxyTab.currentProfileInfo = this.data.profiles[t.innerText];
                }
            },
            deleteRule(ev) {
                const index = parseInt(ev.target.dataset.index);
                this.proxyTab.currentProfileInfo.rules.splice(index, 1);
            },
            addRule(ev) {
                this.proxyTab.currentProfileInfo.rules.push({
                    host: '',
                    proxyName: ''
                });
            },
            renameCurrent(ev) {
                const activeLi = $('#proxy.tab li.active');
                const originalName = activeLi.innerText;
                const newName = prompt('new name:');
                if (this.proxyTab.currentType === 'proxy') {
                    const proxies = this.data['proxies'];
                    proxies[newName] = proxies[originalName];
                    delete proxies[originalName];
                    // rename proxyName in profiles
                    for (let key in this.data.profiles) {
                        const profile = this.data.profiles[key];
                        if (profile.defaultProxy === originalName) {
                            // prevent partial match and replace
                            profile.defaultProxy = newName;
                        }
                        for (let rule of profile.rules) {
                            if (rule.proxyName === originalName) {
                                rule.proxyName = newName;
                            }
                        }
                    }
                    // rename proxyName in data.active
                    if (data.active.name === originalName) {
                        data.active.name = newName;
                    }
                } else {
                    const profiles = this.data['profiles'];
                    profiles[newName] = profiles[originalName];
                    delete profiles[originalName];
                }
            },
            deleteCurrent(ev) {
                const activeLi = $('#proxy.tab li.active');
                const name = activeLi.innerText;
                if (activeLi.parentElement.childElementCount === 1) {
                    alert("can't delete the last proxy/profile.");
                } else if (confirm(`delete ${name}?`)) {
                    if (this.proxyTab.currentType === 'proxy') {
                        delete this.data.proxies[name];
                    } else {
                        delete this.data.profiles[name];
                    }
                }
            },
            addProxy() {
                const name = prompt('new proxy name:');
                if (Object.keys(this.data.proxies).includes(name)) {
                    alert('this name is used.');
                } else {
                    let newProxy = {
                        type: '',
                        host: '',
                        port: ''
                    };
                    this.data.proxies[name] = newProxy;
                    setTimeout(() => $('li.proxy-item:last-child').click(), 0);
                }
            },
            addProfile() {
                const name = prompt('new profile name:');
                if (Object.keys(this.data.profiles).includes(name)) {
                    alert('this name is used.');
                } else {
                    let newProfile = {
                        defaultProxy: 'direct',
                        rules: [{ host: 'example.com', proxyName: 'direct' }]
                    };
                    this.data.profiles[name] = newProfile;
                    setTimeout(() => $('li.profile-item:last-child').click(), 10);
                }
            },
            // for header editor
            addRequestModifier(){
                const newModifier = {pattern:"",name:"",value:"",enable:true};
                this.data.requestModifiers.push(newModifier);
            },
            addResponseModifier(){
                const newModifier = {pattern:"",name:"",value:"",enable:true};
                this.data.responseModifiers.push(newModifier);
            },
            deleteRequestModifier(ev){
                const index = parseInt(ev.target.dataset.index);
                this.data.requestModifiers.splice(index, 1);
            },
            deleteResponseModifier(ev){
                const index = parseInt(ev.target.dataset.index);
                this.data.responseModifiers.splice(index, 1);
            },
            // for setting
            importData() {
                loadTextFile().then(text => {
                    this.data = JSON.parse(text);
                });
            },
            exportData() {
                const text = JSON.stringify(this.data, null, 2);
                const time = new Date();
                const filename = 'shuffle_data-' + time.getFullYear() + '-' + (time.getMonth()+1) + '-' + time.getDate() + '.json';
                saveTextFile(text, filename);
            },
            resetData(){
                if(confirm('reset extension data?')){
                    browser.runtime.sendMessage({cmd:'resetData'}).then(()=>window.location.reload());
                }
            },
            reload() {
                if(confirm('will lost all changes, reload page?')){
                    window.location.reload();
                }
            },
            apply() {
                console.log('save data', JSON.parse(JSON.stringify(this.data)));
                browser.runtime.sendMessage({
                    cmd: 'setData',
                    data: JSON.parse(JSON.stringify(this.data))
                }).then(()=>alert('applied.'));
            }
        },
        computed: {
            proxyNames() {
                return Object.keys(this.data.proxies);
            },
            version(){
                return browser.runtime.getManifest().version;
            }
        },
        mounted() {
            console.log('mounted to #app', this.data);
            $('.proxy-item').click();
            $('#app').style.display = 'block';
        }
    });
    app.mount('#app');
}

function loadTextFile() {
    return new Promise((resolve, reject) => {
        const fileEl = document.createElement('input');
        fileEl.type = 'file';
        fileEl.style.display = 'none';
        fileEl.addEventListener('change', ev => {
            if (ev.target.files.length !== 1) return;
            const file = ev.target.files[0];
            const reader = new FileReader();
            reader.onload = ev => resolve(ev.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
        fileEl.click();
    });
}

function saveTextFile(content, filename) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.download = filename;
    a.href = url;
    a.click();
}

main();
