/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/
const elements = {};
let hostButtons = [];

const insertHostButton = (hostname, activeHost) => {
	const btn = document.createElement("button");
	btn.innerText = hostname;
	btn.classList.add("browser-style");
	btn.value = hostname;
	btn.name = "host";					
	if(hostname === activeHost) {
		btn.disabled = "disabled";
		//btn.classList.add("default");
	}
	elements.hosts.appendChild(btn);
	hostButtons.push(btn);
}

//handler for messages from background script.
const handleMessage = (e) => {		
	if(e.action === "update_status"){
		if(e.data)
			handleStatusResponse(e.data);
		else
			requestTabStatus();
	}		
}

const replaceHostsByText = (text) => {
	elements.hosts.innerHTML = "";
	const par = document.createElement("p");
	par.innerText = text;
	elements.hosts.appendChild(par);
	hostButtons = [];
}

const handleStatusResponse = (status) => {
	//Do nothing on an empty response.
	if(!status)
		return;
	//erase html host list
	elements.hosts.innerHTML = "";
	//insert message (should never happen. Page action should be invisible when host header is absent)
	if(!status?.hosts?.length) {
		replaceHostsByText(browser.i18n.getMessage("noValidHeadersFound"));
		return;
	}
	//Create HTML Host list.
	for(let x = 0; x < status.hosts.length; x++) {
		insertHostButton(status.hosts[x], status.activeHost);
	}
}
//Get data for popup
const requestTabStatus = () => {
	browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
		const tab = tabs[0];
		browser.runtime.sendMessage({ 
			url: tab.url, 
			tabId: tab.id, 
			action: "status"
		}).then(handleStatusResponse);
	});
}

//Handle click events in window.
const handleClickEvent = (tab, target) => {

	switch(target.id) {
		case "settings":
			let openingPage = browser.runtime.openOptionsPage()
			return;
		case "logo":
			replaceHostsByText(browser.i18n.getMessage("loadingMsg"));
			browser.runtime.sendMessage({ 
				tabId: tab.id, 
				action: "refresh", 
				url: tab.url
			});
			break;
	}

	switch(target.name) {		
		case "host":
			for(let x = 0; x < hostButtons.length; x++) {
				hostButtons[x].disabled = "disabled";
			}
			browser.runtime.sendMessage({ 
				tabId: tab.id, 
				action: "switch-host", 
				value: target.value,
				url: tab.url
			});
			break;
	 }
}

/* ENTRYPOINT POPUP */
loadElements(elements, [
	"hosts",
	"headerText",
	"logo",
	"settings"
]);

if(typeof browser === 'undefined') {
	//simulate in browser (for css editing)
	elements.hosts.innerHTML = "";
	for(let x = 0; x < 5; x++) {
		insertHostButton("back-server-" + (x+1), x === 2 ? "back-server-3" : "");
	}	
} else {
	replaceHostsByText(browser.i18n.getMessage("loadingMsg"));
	//Register handler for events from background script.
	browser.runtime.onMessage.addListener(handleMessage);	
	//listen for click events.
	addClickListener(handleClickEvent);
	//get data for popup.
	requestTabStatus();
	elements.headerText.innerText = browser.i18n.getMessage("foundServers");
	elements.logo.title = browser.i18n.getMessage("refreshHostList");
	elements.settings.title = browser.i18n.getMessage("openSettings");
}