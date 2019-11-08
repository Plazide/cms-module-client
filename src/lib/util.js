import cookies from "browser-cookies";

export function getMetaInfo (){
	const head = document.querySelector("head");
	const canonical = head.querySelector("link[rel=\"canonical\"]");

	const meta = {
		url: window.location.pathname || "",
		title: document.title || "",
		description: head.querySelector("meta[name=\"description\"]").getAttribute("content") || "",
		keywords: head.querySelector("meta[name=\"keywords\"]").getAttribute("content") || "",
		canonical: canonical === null ? "" : canonical.getAttribute("href")
	};

	return meta;
}

/**
 * Gets the full selector path to an element. eg. body main section.hero h1.
 * @param {HTMLElement} el - The element to find the path of.
 */
export function getSelectorPath (el){
	if(el.localName === "html") return;

	// Define where to stop the climbing of the node tree.
	const top = "body";

	// Set the start of the path to the current element,
	// and set the first parent.
	let path = getSelector(el, false),
		parent = el.parentNode;

	// Climb up the node tree by getting the parentNode of every element until we reach the body tag.
	// Get the selector of each element and add it to the path.
	while(parent.localName !== top){
		const selector = getSelector(parent, path);
		path = selector + " " + path;

		parent = parent.parentNode;
	}

	return path;
}

/**
 * Gets the full CSS selector of an element, eg. div.editor
 * @param {HTMLElement} el - The element to get the selector of.
 */
export function getSelector (el, path){
	if(!el) return"";

	const localName = el.localName;
	const classList = [...el.classList];
	const ignore = "cms-editable";
	const ignoreIndex = classList.indexOf(ignore);

	let selector = localName;

	// Remove cms-editable class since it only exists in editor mode.
	if(ignoreIndex !== -1)
		classList.splice(ignoreIndex, 1);

	// If element has an ID, add it to the selector.
	// Since IDs should be unique, there is no need to continue building the selector.
	if(el.id){
		selector += "#" + el.id;
		return selector;
	}

	if(classList.length > 0)
		selector += "." + classList.join(".");

	const siblings = findSiblings(el);
	const siblingsOfSameName = findSiblingsOfSameName(localName, siblings);
	const nthChild = siblings.indexOf(el) + 1;

	if(nthChild > 1 && siblingsOfSameName.length > 1)
		selector += `:nth-child(${nthChild})`;

	return selector;
}

function findSiblings (el){
	const parent = el.parentNode;
	const children = [...parent.children];

	return children;
}

/**
 * Find all siblings of an element with the same tag name.
 * @param {HTMLElement} el - The element to find siblings of.
 */
function findSiblingsOfSameName (name, siblings){
	return siblings.filter(sibling => sibling.localName === name);
}

/**
 * Find a section by its element path.
 * @param {string} path - The path to identify the section.
 * @param {Object[]} sections - An array of sections.
 */
export function findSection (element, sections){
	for(let section of sections)
		if(section.element === element)
			return section;
}

export function findChangedSections (sections){
	const changed = [];

	for(let section of sections)
		if(section.edited_text !== section.saved_text)
			changed.push(section);

	return changed;
}

/**
 * Use information in a link to navigate.
 * @param {HTMLElement} el - The a tag to use for navigation information.
 */
export function navigateViaLink (el){
	const href = el.href;

	window.location.href = href;
}

/**
 * Find the top editable element by providing a start element. All parents will be checked for a
 * @param {HTMLElement} el - The element to start at.
 * @param {string[]} tags - An array of valid tags. Function will stop looking when one of these tags have been found.
 */
export function getTopParent (el, tags){
	const top = "body";
	const elements = [];
	let topParent,
		currentEl = el;

	while(currentEl.localName !== top){
		elements.unshift(currentEl);

		currentEl = currentEl.parentNode;
	}

	for(let element of elements)
		if(tags.indexOf(element.localName) !== -1){
			topParent = element;
			break;
		}

	return topParent;
}

/**
 * Add buttons to a local toolbar.
 * @param {HTMLElement[]} tools - Array of buttons to add to the toolbar.
 * @param {HTMLElement} toolbar - The toolbar to add buttons to.
 */
export function appendTools (tools, toolbar){
	for(let tool of tools){
		if(!tool) continue;

		toolbar.appendChild(tool);
	}
}

/**
 * Save position of text selection.
 */
export function saveSelection (){
	document.execCommand("backColor", false, "#ccc");

	if(window.getSelection) {
		var sel = window.getSelection();
		if(sel.getRangeAt && sel.rangeCount)
			return sel.getRangeAt(0);
	}else if(document.selection && document.selection.createRange) {
		return document.selection.createRange();
	}
	return null;
}

/**
 * Apply a saved selection.
 * @param {Range} range - A range object
 */
export function applySelection (range){
	if(range)
		if(window.getSelection) {
			var sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		}else if(document.selection && range.select) {
			range.select();
		}

	document.execCommand("backColor", false, "rgba(0,0,0,0)");
}

/**
 * Show an input prompt to the user.
 * @param {string} msg - The message to display to the user
 * @param {string} type - The type of prompt. Valid values are: "link" and "image"
 * @returns {string|File} Depending on the type of input, the return type could be a string or a File object.
 */
export async function promptUser (titleText, type){
	return new Promise(resolve => {
		const prompt = document.querySelector(".cms-prompt-container");
		const input = prompt.querySelector("input");
		const submit = prompt.querySelector("button");
		const title = prompt.querySelector("h3");

		prompt.classList.add("show");
		title.innerText = titleText;

		input.addEventListener("keyup", (e) => submitPrompt(e));
		submit.addEventListener("click", (e) => submitPrompt(e));
		window.addEventListener("keyup", (e) => cancelPrompt(e));

		function submitPrompt (e){
			const key = e.key;
			const type = e.type;
			const value = input.value;

			if(key !== "Enter" && type !== "click") return;

			hidePrompt();
			resolve(value);
		}

		function cancelPrompt (e){
			const key = e.key;

			if(key === "Escape"){
				hidePrompt();
				resolve(false);
			}
		}

		input.focus();
	});
}

function hidePrompt (){
	const prompt = document.querySelector(".cms-prompt-container");

	prompt.classList.remove("show");
}

export function renderGhostPrompt (locale){
	const body = document.body;
	const container = document.createElement("div");
	const prompt = document.createElement("div");
	const title = document.createElement("h3");
	const input = document.createElement("input");
	const submit = document.createElement("button");

	container.classList.add("cms-prompt-container");
	prompt.classList.add("cms-prompt");

	title.innerText = "Lorem ipsum";
	submit.innerText = locale.prompt.submit;

	prompt.appendChild(title);
	prompt.appendChild(input);
	prompt.appendChild(submit);
	container.appendChild(prompt);

	body.appendChild(container);
}

export function getShortcut (shortcuts, combo){
	for(let shortcut of shortcuts)
		if(shortcut.combo.join(" ") === combo.join(" "))
			return shortcut;

	return false;
}

function parseCookies (cookies){
	const result = {};

	for(let cookie of cookies){
		const keyValue = cookie.split("=");
		const key = keyValue[0].trim();
		const value = keyValue[1];

		result[key] = value;
	}

	return result;
}

export function setCookie (name, value){
	cookies.set(name, value);
}

export function getCookie (name){
	const cookies = parseCookies(document.cookie.split(";"));

	return cookies[name];
}
