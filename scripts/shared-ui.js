/**
	Author: Vincent Bloemen (https://github.com/vinzzB/)
*/

const loadElements = (elements, elementNames) => {
	
	for(let x = 0; x < elementNames.length; x++) {
		const id = elementNames[x];
		const element = document.getElementById(id);
		if(element){
			elements[id] = element;
		}
	}
}

const addClickListener = (clickHandler) => {
	document.addEventListener("click", (e) => {
		browser.tabs.query({active: true, currentWindow: true}).then(tabs => { 	 	
			clickHandler(tabs[0], e.target);		
		});
	});
}