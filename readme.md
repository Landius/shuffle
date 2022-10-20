# shuttle

## feature

- proxy requests by page url rather than resource url
- modify request header

## todo

- [ ] popup page
- [ ] url tester

## note

### onBeforeSendHeaders

Not all headers actually sent are always included in requestHeaders. In particular, headers related to caching (for example, Cache-Control, If-Modified-Since, If-None-Match) are never sent. Also, behavior here may differ across browsers.

### onHeadersReceived

Headers modified in webRequest.onHeadersReceived are not displayed in Netmonitor
[bugzilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1376950)
[stackoverflow](https://stackoverflow.com/questions/27126197/modify-headers-on-onheadersreceived)

### tabs.onUpdated

changeInfo.attention: Indicates whether the tab is drawing attention. For example, attention is true when the tab displays a modal dialog. **but won't fire on tab activated.**
