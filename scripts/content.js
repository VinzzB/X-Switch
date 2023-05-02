/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/

let appPort = browser.runtime.connect({name:"port-from-cs"});

const msg_receiver = (req,sender,sendResp) => {	

	if(!req)
		return;
	
	let el = document.createElement("div");
	el.id = "moz-ext-xserver-header-item";
	el.innerText = req;
	document.body.appendChild(el);	
}

appPort.onMessage.addListener(msg_receiver);