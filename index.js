import "./css/toolbar.css";
import langs from "./locale.json";

/**
 * CMS client class. Creates a WYSIWYG editor.
 */
class CMS{
	/**
	 * Create instance of CMS client.
	 * @param {object} [options] - Options object for CMS instance.
	 * @param {string} [options.lang] - The language of the CMS editor.
	 * @param {string[]} [options.tags] - A list of custom tags to be editable.
	 */
	constructor({ lang, tags }){
		if(!Array.isArray(tags) && tags) throw new TypeError("tags option needs to be an array.");
		if(!lang) lang = "en";

		// Set the language. If a language code is not provided or is unvalid, english will be used a default.
		this.locale = langs[lang];
		this.files = [];
		this.tags = [
			"a",
			"p",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"ul",
			"ol"
		];
		this.sections = [];
		this.shortcuts = [
			{
				name: this.locale.shortcuts.save.name,
				combo: this.locale.shortcuts.save.combo,
				func: this.save,
				global: true
			},
			{
				name: this.locale.shortcuts.bold.name,
				combo: this.locale.shortcuts.bold.combo,
				func: this._makeBold
			},
			{
				name: this.locale.shortcuts.italic.name,
				combo: this.locale.shortcuts.italic.combo,
				func: this._makeItalic
			},
			{
				name: this.locale.shortcuts.underline.name,
				combo: this.locale.shortcuts.underline.combo,
				func: this._makeUnderline
			},
			{
				name: this.locale.shortcuts.linethrough.name,
				combo: this.locale.shortcuts.linethrough.combo,
				func: this._makeLinethrough
			},
			{
				name: this.locale.shortcuts.link.name,
				combo: this.locale.shortcuts.link.combo,
				func: (e) => this.insertLink(e)
			}
		];

		// Add the custom tags to the tags array if such an options was provided.
		if(tags)
			tags.forEach( (tag) => {
				if(this.tags.indexOf(tag) === -1)
					if(typeof tag === "string")
						this.tags.push(tag);
					else
						throw new TypeError("tags option needs to be an array of strings");
				else
					console.warn("The " + tag + " tag is a default editable tag. Passing it in the tags array is unnecessary.");
			});
	}

	/**
	 * Start the CMS client. This will render a toolbar and make dedicated tags editable.
	 */
	run(){
		const tags = this.tags.join(", ");
		const elements = document.querySelectorAll(tags);

		for(const el of elements){
			const cmsElement = {
				original_text: el.innerText,
				edited_text: "",
				path: getSelectorPath(el),
				page: window.location.pathname
			};

			// Save initial state of element.
			this.sections.push(cmsElement);

			el.addEventListener("click", (e) => {
				this._edit(e);
			});

			el.addEventListener("keydown", (e) => {
				this._onKeydown(e);
			});
		}

		this._renderToolbar();
		document.onkeydown = (e) => this._handleShortcuts(e);
	}

	/**
	 * Handle shortcuts.
	 * @param {object} e - The event object.
	 * @private
	 */
	_handleShortcuts(e){
		const combo = [];
		const ctrl = e.ctrlKey;
		const shift = e.shiftKey;
		const alt = e.altKey;
		const key = e.key.toLowerCase();
		const isInputContext = e.target.classList.contains("cms-input-field");

		if(ctrl)
			combo.push("ctrl");

		if(shift)
			combo.push("shift");

		if(alt)
			combo.push("alt");

		combo.push(key);
		const shortcut = getShortcut(this.shortcuts, combo);

		if(shortcut !== false)
			if(isInputContext || shortcut.global){
				e.stopImmediatePropagation();
				e.preventDefault();

				if(e.repeat) return;

				shortcut.func(e);
			}
	}

	/**
	 * Render the toolbar.
	 * @private
	 */
	_renderToolbar(){
		const toolbar = document.createElement("div");
		toolbar.setAttribute("id", "cms-toolbar");

		const flex = document.createElement("div");
		flex.classList.add("flex-container");

		const save = createBtn({
			name: "save",
			title: this.locale.tooltips.save,
			shortcut: this.locale.shortcuts.save,
			handler: this.save
		});

		const bold = createBtn({
			name: "bold",
			title: this.locale.tooltips.bold,
			shortcut: this.locale.shortcuts.bold,
			handler: this._makeBold
		});

		const italic = createBtn({
			name: "italic",
			title: this.locale.tooltips.italic,
			shortcut: this.locale.shortcuts.italic,
			handler: this._makeItalic
		});

		const drag = createBtn({
			name: "drag",
			title: this.locale.tooltips.drag,
			handler: this._dragToolbar
		});

		const underline = createBtn({
			name: "underline",
			title: this.locale.tooltips.underline,
			shortcut: this.locale.shortcuts.underline,
			handler: this._makeUnderline
		});

		const linethrough = createBtn({
			name: "linethrough",
			title: this.locale.tooltips.linethrough,
			shortcut: this.locale.shortcuts.linethrough,
			handler: this._makeLinethrough
		});

		const link = createBtn({
			name: "link",
			title: this.locale.tooltips.link,
			shortcut: this.locale.shortcuts.link,
			handler: (e) => this.insertLink(e)
		});

		const image = createBtn({
			name: "image",
			title: this.locale.tooltips.image,
			shortcut: this.locale.shortcuts.image,
			handler: (e) => this._insertImage(e)
		});

		flex.appendChild(drag);
		flex.appendChild(bold);
		flex.appendChild(italic);
		flex.appendChild(underline);
		flex.appendChild(linethrough);
		flex.appendChild(link);
		flex.appendChild(image);
		flex.appendChild(save);
		toolbar.appendChild(flex);
		document.body.appendChild(toolbar);

		this.toolbar = toolbar;
	}

	/**
	 * Find a editable section by its selector path.
	 * @param {string} path - The path to find a section by.
	 * @private
	 */
	_findSectionByPath(path){
		const sections = this.sections;
		let result = null;

		for(let section of sections)
			if(section.path === path)
				result = section;

		return result;
	}

	/**
	 * Handle the keydown event on editable areas.
	 * @param {object} e - The event object.
	 * @private
	 */
	_onKeydown(e){
		const key = e.keyCode;
		const target = e.target;
		const tagName = target.localName;

		// If user pressed escape, cancel the edit.
		if(key === 27)
			removeInput();

		// If the user is holding the shift key, don't confirm the change.
		// Use the default action instead, which is creating a new line.
		if(key === 13 && e.shiftKey){
			// But if the active element is a list, create a new list item instead of a new line.
			if(tagName === "ul" || tagName === "ol"){
				e.preventDefault();
				const li = document.createElement("li");
				const numOfItems = target.querySelectorAll("li").length + 1;

				li.innerText = this.locale.elements.li + " " + numOfItems;
				target.appendChild(li);
				li.focus();
			}

			return;
		}

		if(key === 13){
			e.preventDefault();
			this._confirmChange(e);
		}
	}

	/**
	 * Update changes to the sections object.
	 * @param {string} path - The path of the section to update.
	 * @param {string} value - The value that will be inserted.
	 * @private
	 */
	_updateChanges(path, value){
		const section = this._findSectionByPath(path);

		section.edited_text = value;
	}

	/**
	 * Confirm changes to a editable area.
	 * @param {object} e - An event object.
	 * @private
	 */
	_confirmChange(e){
		const target = e.target;
		const path = getSelectorPath(target);

		this._updateChanges(path);
		removeInput();
	}

	/**
	 * Make an area editable when clicked.
	 * @param {object} e - An event object.
	 * @private
	 */
	_edit(e){
		let el = e.target,
			i = 0;

		const childTags = ["li", "b", "i", "span", "u", "strike", "a"];
		const path = getSelectorPath(el).split(" ");
		const elements = path.map( (item) => {
			const tagName = item.split(".")[0].split("#")[0];

			return tagName;
		}).filter( (value) => {
			if(this.tags.indexOf(value) !== -1)
				return true;
			else
				return false;
		});
		const containsEditableTags = elements.length > 0;

		if(el.localName === "a"){
			e.stopImmediatePropagation();
			e.preventDefault();
		}

		if(!containsEditableTags)
			return;

		while(childTags.indexOf(el.localName) !== -1){
			// Cancel after 40 iterations to avoid infinite loops.
			if(i >= 40) break;

			if(elements.indexOf(el.localName) !== -1 && childTags.indexOf(el.localName) === -1)
				break;

			if(elements.indexOf(el.parentNode.localName) !== -1)
				el = el.parentNode;

			i += 1;
		}

		el.setAttribute("contenteditable", "true");
		el.setAttribute("spellcheck", "false");
		el.setAttribute("autocomplete", "off");
		el.setAttribute("autocapitalize", "off");
		el.setAttribute("autocorrect", "off");
		el.classList.add("cms-input-field");
		el.focus();

		document.addEventListener("mousedown", handleAbort, { once: true });
	}

	/**
	 * Saves the changes to the specified url or fires a save event that will be handled outside of the class instance.
	 */
	save(){
		console.log("saved");
	}

	/**
	 * Handle the dragging of the toolbar.
	 * @param {object} e - An event object.
	 * @private
	 */
	_dragToolbar(e){
		const el = e.target;
		const toolbar = el.parentNode.parentNode;

		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", removeListeners);
		el.addEventListener("blur", removeListeners);

		function move(e){
			const mouseX = e.clientX;
			const mouseY = e.clientY;
			const offsetX = el.clientWidth / 2;
			const offsetY = toolbar.clientHeight / 2;

			const posX = mouseX - offsetX;
			const posY = mouseY - offsetY;

			const minX = 0;
			const maxX = window.innerWidth - (toolbar.clientWidth + 3);
			const minY = 0;
			const maxY = window.innerHeight - (toolbar.clientHeight + 3);

			if(posX > minX && posX < maxX)
				toolbar.style.left = posX + "px";

			if(posY > minY && posY < maxY)
				toolbar.style.top = posY + "px";
		}

		function removeListeners(){
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", removeListeners);
			el.removeEventListener("blur", removeListeners);
		}
	}

	/**
	 * Make the selected text bold.
	 * @private
	 */
	_makeBold(){
		document.execCommand("bold");
	}

	/**
	 * Make the selected text italic.
	 * @private
	 */
	_makeItalic(){
		document.execCommand("italic");
	}

	/**
	 * Make the selected text underlined.
	 * @private
	 */
	_makeUnderline(){
		document.execCommand("underline");
	}

	/**
	 * Make the selected text have a line through it.
	 * @private
	 */
	_makeLinethrough(){
		document.execCommand("strikeThrough");
	}

	/**
	 * Instert an image at the current position.
	 * @param {object} e - An event object.
	 * @private
	 */
	async _insertImage(e){
		e.preventDefault();
		const titleText = this.locale.prompt.image;
		const cmdText = "insertHtml";
		const type = "file";

		const savedSelection = saveSelection();
		if(!savedSelection) return;

		const result = await promptUser(titleText, type);
		applySelection(savedSelection);

		if(!result) return;

		const{ url, name, file } = result;
		this.files.push(file);

		document.execCommand(
			cmdText,
			false,
			`<img src="${url}" alt="${name}" style="max-width:100%;" />`
		);
	}

	/**
	 * Instert link at the current position.
	 * @param {object} e - An event object.
	 * @private
	 */
	async insertLink(e){
		e.preventDefault();
		const titleText = this.locale.prompt.link;
		const cmdText = "createLink";
		const type = "input";

		const savedSelection = saveSelection();
		if(!savedSelection) return;

		const link = await promptUser(titleText, type);
		applySelection(savedSelection);

		if(link)
			document.execCommand(cmdText, false, link);
	}
}

function saveSelection(){
	document.execCommand("backColor", false, "#ccc");

	const selection = window.getSelection();

	if(!selection.focusNode)
		return false;

	const range = document.createRange();
	const extentOffset = selection.extentOffset;
	const baseOffset = selection.baseOffset;
	const focusNode = selection.focusNode;
	const startIndex = extentOffset < baseOffset ? extentOffset : baseOffset;
	const endIndex = extentOffset < baseOffset ? baseOffset : extentOffset;

	range.setStart(focusNode, startIndex);
	range.setEnd(focusNode, endIndex);

	return{ range, selection };
}

function applySelection({ range, selection }){
	selection.removeAllRanges();
	selection.addRange(range);

	document.execCommand("backColor", false, "transparent");
}

function getShortcut(shortcuts, combo){
	for(let shortcut of shortcuts)
		if(shortcut.combo.join(" ") === combo.join(" "))
			return shortcut;

	return false;
}

async function promptUser(msg, type){
	return new Promise( resolve => {
		const promptContainer = document.createElement("div");
		promptContainer.classList.add("prompt-container");

		const promptMsg = document.createElement("h4");
		promptMsg.innerText = msg;

		const promptCancel = document.createElement("div");
		promptCancel.classList.add("prompt-cancel");
		promptCancel.addEventListener("click", cancelPrompt);
		document.addEventListener("keydown", cancelPrompt);

		const promptInput = createPromptInput(type);
		promptInput.addEventListener("keydown", (e) => submitPrompt(e, promptInput));

		const promptSubmit = document.createElement("div");
		promptSubmit.classList.add("cms-submit-btn");
		promptSubmit.innerText = "Insert";
		promptSubmit.addEventListener("click", (e) => submitPrompt(e, promptInput));

		promptContainer.appendChild(promptCancel);
		promptContainer.appendChild(promptMsg);
		promptContainer.appendChild(promptInput);
		promptContainer.appendChild(promptSubmit);

		document.body.appendChild(promptContainer);

		function cancelPrompt(e){
			e.stopImmediatePropagation();
			e.preventDefault();
			const type = e.type;
			const key = e.key;

			if(type !== "click" && key !== "esc") return;

			document.body.removeChild(promptContainer);
			document.removeEventListener("keyup", cancelPrompt);
			resolve(false);
		}

		function submitPrompt(e, el){
			const target = el;
			const key = e.keyCode;
			const type = e.type;
			const tag = el.localName;
			let value = target.innerText;

			if(key === 13){
				e.preventDefault();
				document.body.removeChild(promptContainer);

				resolve(value);
			}

			if(type === "click"){
				document.body.removeChild(promptContainer);

				if(tag === "input"){
					const file = el.files[0];
					const reader = new FileReader();

					reader.readAsDataURL(file);
					reader.onload = (theFile) => {
						const name = file.name;
						const url = theFile.target.result;

						resolve({ url, name, file: theFile });
					};

					return;
				}

				resolve(value);
			}
		}
	});
}

function createPromptInput(type){
	let input = null;

	if(type === "input"){
		input = document.createElement("div");
		input.setAttribute("contenteditable", "true");
		input.classList.add("prompt-input");
		input.focus();
	}

	if(type === "file"){
		input = document.createElement("input");
		input.setAttribute("type", "file");
		input.setAttribute("accept", "image/png, image/jpeg, image/gif, image/svg+xml");
		input.classList.add("prompt-input");
	}

	return input;
}

function createBtn({ name, handler, title, shortcut }){
	const btn = document.createElement("div");
	const combo = shortcut ? ` (${shortcut.combo.join("+")})` : "";
	btn.setAttribute("title", title + combo);
	btn.classList.add("cms-" + name);
	btn.classList.add("cms-btn");
	btn.addEventListener("mousedown", handler);

	return btn;
}

function getSelectorPath(el){
	const top = "body";
	let path = getSelector(el),
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

function getSelector(el){
	if(!el) return;

	let selector = el.localName;

	if(!selector) return;

	if(el.id)
		selector += "#" + el.id;
	else if(el.classList.length > 0 && !el.classList.contains("cms-input-field"))
		selector += "." + el.className.split(" ").join(".");

	return selector + " ";
}

function reverseStr(str, sep){
	const list = str.split(sep);
	const result = list.reverse().join(sep);

	return result;
}

function removeInput(){
	const inputs = document.querySelectorAll(".cms-input-field");

	for(let input of inputs){
		input.removeAttribute("contenteditable");
		input.classList.remove("cms-input-field");
		input.removeEventListener("mousedown", handleAbort);
	}
}

function handleAbort(e){
	const target = e.target.localName !== "li" ? e.target : e.target.parentNode;
	const ctrl = e.ctrlKey;

	if(shouldAbort(target) && !ctrl)
		removeInput();
}

function shouldAbort(target){
	const should = !target.classList.contains("cms-input-field") &&
					!target.classList.contains("cms-btn") &&
					!target.classList.contains("prompt-container") &&
					!target.classList.contains("prompt-input");

	return should;
}

export default CMS;
