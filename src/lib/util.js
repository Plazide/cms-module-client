import cookies from "browser-cookies";

/**
 * Gets the full selector path to an element. eg. body main section.hero h1.
 * @param {HTMLElement} el - The element to find the path of.
 */
export function getSelectorPath (el){
	const top = "body";
	const children = el.parentNode.children;
	let nthChild = 0;

	for(let i = 0; i < children.length; i++){
		const child = children[i];
		if(child === el)
			nthChild = i + 1;
	}

	let path = getSelector(el).trim() + `:nth-child(${nthChild}) `,
		parent = el.parentNode,
		i = 0;

	if(el.localName === "html") return;
	if(!parent) return;

	while(parent.localName !== top){
		let selector = path;

		selector += getSelector(parent);

		parent = parent.parentNode;
		path = selector;

		// Safety measure to prevent infinite loop.
		if(i > 50)
			break;

		i += 1;
	}

	return reverseStr(path, " ").trim();
}

/**
 * Gets the full CSS selector of an element, eg. div.editor
 * @param {HTMLElement} el - The element to get the selector of.
 */
export function getSelector (el){
	if(!el) return;

	let selector = el.localName;

	if(!selector) return;
	const classList = [...el.classList];
	const index = classList.indexOf("cms-editable");

	if(index !== -1)
		classList.splice(index, 1);

	if(el.id)
		selector += "#" + el.id;
	else if(classList.length > 0)
		selector += "." + classList.join(".");

	return selector + " ";
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
	const target = el;
	let topParent = target;

	while(tags.indexOf(topParent.localName) === -1 || topParent.localName === "body")
		topParent = topParent.parentNode;

	return topParent;
}

/**
 * Add buttons to a local toolbar.
 * @param {HTMLElement[]} tools - Array of buttons to add to the toolbar.
 * @param {HTMLElement} toolbar - The toolbar to add buttons to.
 */
export function appendTools (tools, toolbar){
	for(let tool of tools)
		toolbar.appendChild(tool);
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

/**
 * Reverse a string.
 * @param {string} str - The string to reverse.
 * @param {string} [sep] - A character that seperates the string.
 */
function reverseStr (str, sep = ""){
	const list = str.split(sep);
	const result = list.reverse().join(sep);

	return result;
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
