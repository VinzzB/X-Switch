/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/

/*===================
  VARS 
  ===================*/

const tabsData = {};
let validHeaderNames = [];
let options = {};

/*===================
  FUNCTIONS 
  ===================*/

const createTabData = () => {
	return {
		headers: [],
		hosts: [],
		activeHost: "",
		requestedHost: "",
		refresh_counter: 0,
		url: ""
	};
}

const getTabData = (tabId) => {
	return tabsData[tabId] || (tabsData[tabId] = createTabData());
}

const getHostHeaderName = (respHeaders) => {
	for(let x = 0; x < validHeaderNames.length; x++) {		
		if(respHeaders.has(validHeaderNames[x]))
			return validHeaderNames[x];		
	}
}

//triggered when loading a page in the browser.
const handleHeadersReceived = (e) => {
	//console.log("headers received", e);
	//only process main page request.
	if(e.type !== "main_frame") {
		return;
	}
	
	const tabData = getTabData(e.tabId);	
	const host = e.responseHeaders.find(p => 
		validHeaderNames.includes(p.name.toLowerCase()));
	
	//Stop execution and reset state when headers are not found.
	if(!host) {
		tabsData[e.tabId] = createTabData();									 
		return;
	}
	
	//We found some headers. Store new state in memory
	tabData.activeHost = host.value;
	tabData.headers = e.responseHeaders;
	tabData.url = e.url;
		
	//Are we switching to a new host (loop)?
	if(tabData.requestedHost) {
		//check if the page being loaded is from the requested host.
		if(tabData.activeHost === tabData.requestedHost) {
			//The page is loaded from requested host. 
			//reset loop vars and trigger complete event.
			console.log(tabData.refresh_counter || 1, 
						"reload(s) needed switching over to", 
						tabData.activeHost);			
			tabData.refresh_counter = 0;
			tabData.requestedHost = "";
			browser.runtime.sendMessage({action: "swithing_complete"})
				.then(undefined,err => {/* Silently continue */});
			
			tabData.fnMessageToCs?.(tabData.activeHost);			
		} else {
			//The page was not loaded from the requested host, try again or bail.
			if(tabData.refresh_counter++ < (options.max_reloads || 50)) {
				TryNewHost(e.tabId, e.url);
			} else {
				tabData.requestedHost = "";
				tabData.refresh_counter = 0;
			}
		}
	}
}

const searchHosts = (url, tabData) => {	
	const requests = [];
	
	//reset host list
	tabData.hosts = [];
	
	//launch a few background http requests for header inspection.
	for(let x = 0; x < (options.seekRequests || 5); x++) {
		requests.push(fetch(url,{
			cache: "no-store", 
			credentials: "omit"
		}));
	}
	
	//when all requests finished, process the results (read header values)
	//we can not read cookies in these responses. 
	//Switching servers would be much faster if this was an option. 
	//We could then cache the cookies and replace them when switching hosts.
	Promise.all(requests).then(responses => {			
		
		//create a distinct list of hostname values.
		const hosts = [];
		if(tabData.activeHost)
			hosts.push(tabData.activeHost);
		for(let x = 0; x < responses.length; x++) {	
			const resp = responses[x];		
			const hdrName = getHostHeaderName(resp.headers);
			const hostname = resp.headers.get(hdrName);
			if(!hosts.includes(hostname)) {
				hosts.push(hostname);
			}
		}
		
		//store available hosts in memory (sorted)
		tabData.hosts = hosts.sort();
				
		//send a completed message to page action (if opened)
		browser.runtime.sendMessage({action: "refresh_complete"})
			.then(undefined,err => {/* Silently continue */});
	});
}

//Load extension options (using ff sync).
const handleOptionsResult = (items) => {
	options = items; 
	validHeaderNames = options.headerNames.toLowerCase().match(/[^ ;]+/g);
}

//Reload options when changed. 
//- triggered immediately when options were changed locally
//- can trigger from FF Sync (sync across browsers every 10min)
const handleOptionsChanged = (changes) => {
	loadOptions(handleOptionsResult);
}

//Content script listener.
const handleContentScriptConnected = (e) => {	
	const tabData = getTabData(e.sender.tab.id);
	//register cs callback & disconnect fn.
	tabData.fnMessageToCs = e.postMessage;
	e.onDisconnect.addListener(handleContentScriptDisconnect);		
	//Return the current host value.
	e.postMessage(tabData.activeHost);			
};

//cleanup refs on Content script disconnects.
const handleContentScriptDisconnect = (e) => {
	getTabData(e.sender.tab.id).fnMessageToCs = undefined;
}

//Extension page listener.
const handleActionPageMsg = (e, exCtx, resp) => {	
	//console.log("handleActionPageMsg", {e, exCtx});
	const tabId = e.tabId || exCtx.tab.id;
	const tabData = getTabData(tabId);	
	switch(e.action) {		
		 case "status":			
			resp({
				hosts: tabData.hosts,
				activeHost: tabData.activeHost
			});
			break;
		case "switch-host":	
			tabData.requestedHost = e.value;
			TryNewHost(tabId, tabData.url);	
			break;
		case "refresh":
			searchHosts(e.url, tabData);
			break;
	}
}
//const delCookieNames = [ "ApplicationGatewayAffinityCORS", "ApplicationGatewayAffinity", "ASP.NET_SessionId","dtCookie"]
//Removes cookies and reloads the browser page.
const TryNewHost = (tabId, url) => {
	browser.cookies.getAll({ url }).then(cookies => {		
		//remove cookies from browser cookiestore.
		const delCookiesTasks = [];
		for(let x = 0; x < cookies.length; x++) {			
			//if(delCookieNames.includes(cookies[x].name)){
				console.log("remove cookie",cookies[x].name, cookies[x].domain);
				delCookiesTasks.push(browser.cookies.remove({ 
					url: url, 
					name: cookies[x].name 
				}));
			//}
		}
		//When all domain cookies are removed, reload the page.
		Promise.all(delCookiesTasks).then(p => {				
			browser.tabs.reload(tabId, { bypassCache: true });
		});
	});
}

//Runs when the page is fully loaded. 
const handlePageLoaded = (e) => {
	const tabData = getTabData(e.tabId);
	//Set visibility for the Page Action button.
	const {show, hide} = browser.pageAction;
	const fnPage = tabData.activeHost ? show : hide;
	//Insert or remove content script and css.
	const {insertCSS, removeCSS} = browser.tabs;
	const fnCss = tabData.activeHost && options.showContentHint ? insertCSS : removeCSS
	fnPage(e.tabId);
	fnCss(e.tabId, { file: "css/content.css" });	
	if(tabData.activeHost && options.showContentHint) {
		browser.scripting.executeScript({
			target: {
				tabId: e.tabId
			},
			files: ["scripts/content.js"],
		});
	}
	//Search for hostnames.
	if(tabData.activeHost && !tabData.hosts.length) {
		searchHosts(e.url, tabData);
	}	
}

const handleTabRemoved = (tabId, info) => {
	if(tabsData[tabId])
		delete tabsData[tabId];
}

/* ENTRYPOINT BACKGROUND SCRIPT */
loadOptions(handleOptionsResult);

/* Register API LISTENERS */
browser.storage.sync.onChanged.addListener(handleOptionsChanged);
browser.runtime.onConnect.addListener(handleContentScriptConnected);
browser.runtime.onMessage.addListener(handleActionPageMsg);
browser.tabs.onRemoved.addListener(handleTabRemoved);
browser.webNavigation.onCompleted.addListener(handlePageLoaded);
browser.webRequest.onHeadersReceived.addListener(handleHeadersReceived, 
	{ urls: ["<all_urls>"] }, ["responseHeaders"]);