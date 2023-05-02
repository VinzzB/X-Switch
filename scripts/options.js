/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/

const elements = {};

const saveOptions = () => {
	browser.storage.sync.set({ 
		headerNames: elements.headerNames.value,
		seekRequests: elements.seekRequests.value,
		max_reloads: elements.max_reloads.value,
		showContentHint: elements.showContentHint.checked,
		reloadOtherTabs: elements.reloadOtherTabs.checked,
	}).then(p => elements.submitBtn.disabled = "disabled");
}

const handleLoadOptionsResult = (items) => {	
	elements.headerNames.value = items.headerNames;		 
	elements.seekRequests.value = items.seekRequests;		 
	elements.max_reloads.value = items.max_reloads;		 
	elements.showContentHint.checked = items.showContentHint;		 
	elements.reloadOtherTabs.checked = items.reloadOtherTabs;		 
	elements.submitBtn.disabled = "disabled";
}

const handleClickEvent = (tab, target) => {
	switch(target.id) {			 
		case "submitBtn": 			 
			saveOptions();
			break;			
	}
}

/* ENTRYPOINT OPTIONS */
if(typeof browser !== 'undefined') {
	document.addEventListener("change", (e) => {
		elements.submitBtn.disabled = "";
	});

	document.addEventListener("keydown", (e) => {
		if(e.target.tagName === "INPUT")
			elements.submitBtn.disabled = "";
	});	
	
	loadElements(elements, [ 
		"headerNames", 
		"seekRequests", 
		"max_reloads", 
		"showContentHint", 
		"reloadOtherTabs",
		"submitBtn",
		"labelHeaderNames",
		"labelSeekRequests",
		"labelMaxReloads",
		"labelShowContentHint",
		"labelReloadOtherTabs"
	]);
	
	elements.labelHeaderNames.innerText = browser.i18n.getMessage("lblOpt_HttpHeaders");
	elements.labelSeekRequests.innerText = browser.i18n.getMessage("lblOpt_AmountSeekRequests");
	elements.labelMaxReloads.innerText = browser.i18n.getMessage("lblOpt_MaxReloads");
	elements.labelShowContentHint.innerText = browser.i18n.getMessage("lblOpt_ShowInCorner");
	elements.labelReloadOtherTabs.innerText = browser.i18n.getMessage("lblOpt_ReloadOtherTabs");
	elements.submitBtn.innerText = browser.i18n.getMessage("save");
	
	addClickListener(handleClickEvent);
	loadOptions(handleLoadOptionsResult);
}