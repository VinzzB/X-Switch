/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
	
	PERMISSONS explanation:
	
	webRequest			For reading header vaules
	webRequestBlocking	For request cancellation (when wrong headers were found)
	webNavigation		For Page action visibility
	scripting			Needed to inject JS in page. (show hostname in corner)
	cookies				Read/Write browser cookies. (only used for deletion)
	tabs				Query active tab data.
	activeTab			Query active tab data.
	storage				Store options (across devices, if FF sync is used!)
	<all_urls>			Inspect all urls for configured headers.
	
*/

/*===================
  VARS 
  ===================*/

let options = {};
let validHeaderNames = []; // constructed when loading options.
const domains = {/*
	"[example.com]": {
		hosts: [],		//store hostnames per domain.
		activeHost: ""	//store activeHost per domain.
	}, ...
*/};

const tabsData = {/*
	[tabId]: {
		requestedHost: "", //Reload page till we have the requested host.
		reloadCounter: 0   //counter for page reloads
	}
*/};

/*===================
  FUNCTIONS 
  ===================*/

const createDomainData = () => {
	return {
		hosts: [],
		activeHost: ""
	};
}

const createTabData = () => {
	return {
		requestedHost: "",
		reloadCounter: 0
	};
}

const getDomainName = (url) => {
	return new URL(url).hostname;
}

const getDomainData = (url) => {
	const name = getDomainName(url);
	return domains[name] || (domains[name] = createDomainData());
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

const findHostHeader = (respHeaders) => {
	return respHeaders.find(p => validHeaderNames.includes(p.name.toLowerCase()))
}

//triggered when fetching a page in the browser (also when switching to a new host (loop)).
//This is a blocking request which can be cancelled when in the switch loop.
const handleHeadersReceived = (e) => {
	//only process main page request.
	if(e.type !== "main_frame" || e.frameId)
		return;
				
	//get hostname from header (if any)
	const host = findHostHeader(e.responseHeaders);	
		
	//We found some headers. Store new state in memory
	const tabData = getTabData(e.tabId);
	const domain = getDomainData(e.url);
	domain.activeHost = host?.value;	
	//Are we switching to a new host (loop)?
	if(tabData.requestedHost) {
		//No host data found in headers. try again.
		if(!host) {
			handleInvalidrequest(tabData, options, e);
			return;
		}
	
		//check if the page being loaded is from the requested host.
		if(domain.activeHost === tabData.requestedHost) {
			//The page is loaded from requested host.
			console.log(tabData.reloadCounter + 1, 
						"reload(s) needed switching over to", 
						tabData.activeHost);
			//reset loop vars.
			resetHostRequestLoop(tabData);
			//trigger complete events.
			sendUpdateStatusToPopUp(domain);
			tabData.fnMessageToCs?.(domain.activeHost);				
			//reload all tabs with same domainname.
			reloadTabsInSameDomain(e.url, [ e.tabId ]);
			return;
		} 
		
		//The page was not loaded from the requested host, try again or bail.
		handleInvalidrequest(tabData, options, e);
	}
}

const handleInvalidrequest = (tabData, options, e) => {	
	if(tabData.reloadCounter++ < (options.max_reloads || 50)) {
		//try again.
		e.cancel = true;
		tryNewHost(e.tabId, e.url);
	} else {
		//stop the loop. we tried... (todo: msg to user)
		resetHostRequestLoop(tabData);
		//reload all tabs with same domainname. (we do have other cookies)
		reloadTabsInSameDomain(e.url, [ e.tabId ]);
	}
}

const sendUpdateStatusToPopUp = (data) => {
	browser.runtime.sendMessage({action: "update_status", data})
		.catch(err => {/* Silently continue */});
}

//reload all tabs with same domainname.
const reloadTabsInSameDomain = (url, notTabIds = []) => {
	
	if(!options.reloadOtherTabs)
		return;
	
	const domainName = getDomainName(url);
	browser.tabs.query({ url: "*://" + domainName + "/*" }).then(tabs => {
		for(let x = 0; x < tabs.length; x++) {
			//do not reload the tab we just processed.
			if(notTabIds.includes(tabs[x].id))
				continue;
			//reload tab (fetch from cache is allowed) 
			browser.tabs.reload(tabs[x].id);
		}
	});
}

//resets reload loop
const resetHostRequestLoop = (tabData) => {
	tabData.requestedHost = "";
	tabData.reloadCounter = 0;	
}

//Search for other hostnames in background Http requests.
const searchHosts = (url, tabData) => {	
	const requests = [];
	const domain = getDomainData(url);
	//reset host list
	domain.hosts = [];
		
	//launch a few background http requests for header inspection.
	for(let x = 0; x < (options.seekRequests || 5); x++) {
		requests.push(fetch(url,{
			cache: "no-store", 
			credentials: "omit"
		}));
	}
	
	//When all requests finished, process the results (read header values)
	//We can not read cookies in these responses. 
	//Switching servers would be much faster if this was an option. 
	//We could then cache the cookies and replace them when switching hosts.
	Promise.all(requests).then(responses => {
		//create a distinct list of hostname values.
		const hosts = [];
		if(domain.activeHost)
			hosts.push(domain.activeHost);
		
		for(let x = 0; x < responses.length; x++) {	
			const resp = responses[x];		
			const hdrName = getHostHeaderName(resp.headers);
			const hostname = resp.headers.get(hdrName) || "ERROR: UNKNOWN HOST !";
			if(hostname && !hosts.includes(hostname)) {
				hosts.push(hostname);
			} 			
		}
		//store available hosts in memory (sorted)
		domain.hosts = hosts.sort();
		//send a completed message to page action (if opened)
		sendUpdateStatusToPopUp(domain);
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
	const domain = getDomainData(e.sender.url);
	//register cs callback & disconnect fn.
	tabData.fnMessageToCs = e.postMessage;
	e.onDisconnect.addListener(handleContentScriptDisconnect);
	//Return the current host value.
	e.postMessage(domain.activeHost);
};

//cleanup refs on Content script disconnects.
const handleContentScriptDisconnect = (e) => {
	getTabData(e.sender.tab.id).fnMessageToCs = undefined;
}

//Extension page listener.
const handleActionPageMsg = (e, exCtx, resp) => {
	const tabId = e.tabId || exCtx.tab.id;
	const tabData = getTabData(tabId);
	const domain = getDomainData(e.url);
	switch(e.action) {
		 case "status":	
			//Search for hostnames. 
			if(domain.activeHost && !domain.hosts.length) {
				searchHosts(e.url, tabData);
			} else	 
				resp(domain);
			break;
		case "switch-host":	
			tabData.requestedHost = e.value;
			tryNewHost(tabId, e.url);
			break;
		case "refresh":
			searchHosts(e.url, tabData);
			break;
	}
}
//const delCookieNames = [ "ApplicationGatewayAffinityCORS", "ApplicationGatewayAffinity", "ASP.NET_SessionId","dtCookie"]
//Removes cookies and reloads the browser page.
const tryNewHost = (tabId, url) => {

	if(!url)
		return;

	browser.cookies.getAll({ url }).then(cookies => {
		//remove cookies from browser cookiestore.
		const delCookiesTasks = [];
		for(let x = 0; x < cookies.length; x++) {
			//TODO: only remove cookies set in settings. (for non sticky session testing)
			//if(delCookieNames.includes(cookies[x].name)){
				console.log("remove cookie",cookies[x].name, cookies[x].domain);
				delCookiesTasks.push(browser.cookies.remove({ 
					url: url, 
					name: cookies[x].name 
				}));
			//}
		}
		//When all domain cookies are removed, reload the active tab page.
		Promise.all(delCookiesTasks).then(p => {
			browser.tabs.reload(tabId, { bypassCache: true });
		});
	});
}

//Runs when the page is fully loaded. 
const handlePageLoaded = (e) => {
	//do not handle data in IFrames or FF about screens.
	if(e.frameId || e.url.startsWith("about:"))
		return;
	if(options.showContentHint) {
		const domain = getDomainData(e.url);
		//Insert or remove content script and css.
		const {insertCSS, removeCSS} = browser.tabs;
		const fnCss = domain.activeHost ? insertCSS : removeCSS
		fnCss(e.tabId, { file: "css/content.css" });
		if(domain.activeHost) {
			browser.scripting.executeScript({
				target: { tabId: e.tabId },
				files: ["scripts/content.js"],
			});
		}
	}
}

//cleanup when tab is closed.
const handleTabRemoved = (tabId, info) => {
	if(tabsData[tabId])
		delete tabsData[tabId];
}

//Handle popup visibility in Committed event.
//Make sure 'show_matches' has the value '<all_urls>' in the manifest file so that
//the popup stays open during switching. (handy for notifcation in page action (todo))
const handlePageCommitted = (e) => {
	//ignore IFrames.
	if(e.frameId)
		return;
	//set page action visibility.
	const domain = getDomainData(e.url);
	setPageActionVisibility (e.tabId, domain.activeHost);
	sendUpdateStatusToPopUp(domain);
}

const setPageActionVisibility = (tabId, show) => {
	if(show)
		browser.pageAction.show(tabId);
	else
		browser.pageAction.hide(tabId);
}

const handleRequestAborted = (req) => {
	if(req.error !== "NS_BINDING_CANCELLED_OLD_LOAD") { // do not stop on our own cancelled requests.
		const tabData = getTabData(req.tabId);
		const domain = getDomainData(e.url);	
		if(tabData.requestedHost) {
			resetHostRequestLoop(tabData);
			console.log("loop request aborted", req.url, req.tabId );
		}
	}
}

/* ENTRYPOINT BACKGROUND SCRIPT */
loadOptions(handleOptionsResult);

/* Register API LISTENERS */
//Listen for options changed and reload when needed.
browser.storage.sync.onChanged.addListener(handleOptionsChanged);
//Listen for CS script messages (browser page).
browser.runtime.onConnect.addListener(handleContentScriptConnected);
//Listen for action page messages (popup).
browser.runtime.onMessage.addListener(handleActionPageMsg);
//Listen for tab removals.
browser.tabs.onRemoved.addListener(handleTabRemoved);
//Listen for page loaded event
browser.webNavigation.onCompleted.addListener(handlePageLoaded);
//Listen for page committed event.
browser.webNavigation.onCommitted.addListener(handlePageCommitted);
//Listen for web requests so we can inspect htpp headers.
browser.webRequest.onHeadersReceived.addListener(handleHeadersReceived, 
	{ urls: ["<all_urls>"] }, ["responseHeaders", "blocking"]);

//Listen for webRequest errors and stop the refresh loop when an error occurs.
browser.webRequest.onErrorOccurred.addListener(handleRequestAborted, 
	{ urls: ["<all_urls>"] });