/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/
const elements = {};
let hostButtons = [];

const insertHostButton = (hostname, activeHost) => {
	const btn = document.createElement("button");
	btn.innerText = hostname;
	btn.value = hostname;
	btn.name = "host";					
	if(hostname === activeHost) {
		btn.disabled = "disabled";
	}
	elements.hosts.appendChild(btn);
	hostButtons.push(btn);
}

//handler for messages from background script.
const handleMessage = (e) => {		
	if(e.action === "swithing_complete" 
	|| e.action === "refresh_complete") {
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
	
//Get data for popup
const requestTabStatus = () => {
	browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
		const tabId = tabs[0].id;
		browser.runtime.sendMessage({ tabId, action: "status"}).then(status => {  
			elements.hosts.innerHTML = "";

			if(!status?.hosts?.length) {
				replaceHostsByText(browser.i18n.getMessage("noValidHeadersFound"));
				return;
			}
			
			for(let x = 0; x < status.hosts.length; x++) {
				insertHostButton(status.hosts[x], status.activeHost);
			}
		});
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
		insertHostButton("testServer " + (x+1), "");		
	}	
} else {
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