/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/

const loadOptions = (resultFn) => {	
	browser.storage.sync.get({ 
		headerNames: "x-server",
		seekRequests: 5,
		max_reloads: 50,
		showContentHint: true
	}, resultFn);
}
