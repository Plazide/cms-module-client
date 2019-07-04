import "./css/toolbar.css";
import langs from "./locale.json";
import EventEmitter from "events";

/**
 * CMS client class. Creates a WYSIWYG editor.
 */
class CMS extends EventEmitter{
	/**
	 * Create instance of CMS client.
	 * @param {object} [options] - Options object for CMS instance.
	 * @param {string} [options.lang] - The language of the CMS editor.
	 * @param {string[]} [options.tags] - A list of custom tags to be editable.
	 */
	constructor({ lang, tags, saveUrl, publishUrl, uploadUrl, auth }){
		super();
		if(!Array.isArray(tags) && tags) throw new TypeError("tags option needs to be an array.");
		if(!lang) lang = "en";

		// Set the language. If a language code is not provided or is unvalid, english will be used a default.
		this.locale = langs[lang] || langs.en;

		this.saveUrl = saveUrl;
		this.publishUrl = publishUrl;
		this.uploadUrl = uploadUrl;
		this.auth = auth;
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
				func: (e) => this.save(e),
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
				func: (e) => this._insertLink(e)
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
				original_text: el.innerHTML,
				edited_text: "",
				saved_text: "",
				path: getSelectorPath(el),
				page: window.location.pathname
			};

			// Save initial state of element.
			this.sections.push(cmsElement);

			el.addEventListener("click", (e) => this._edit(e));

			el.addEventListener("keydown", (e) => this._onKeydown(e));
		}

		this._renderToolbar();
		this._setSaveStatus();
		this._setPublishStatus();
		document.onkeydown = (e) => this._handleShortcuts(e);
	}

	/**
	 * Saves the changes to the specified url or fires a save event that will be handled outside of the class instance.
	 */
	async save(e){
		if(!this._changedSinceSave())
			return;

		this._setLoading();
		const paths = this.sections.map( section => {
			return section.path;
		});

		for(let path of paths){
			const el = document.querySelector(path);
			const value = el.innerHTML;
			const section = this._findSectionByPath(path);
			section.edited_text = value;
		}

		// Only save the sections that have been changed.
		const sections = this.sections.filter( section => {
			return section.saved_text !== section.edited_text;
		});

		// If no saveUrl was specified, fire the save event with the edited sections
		// and let the user of the module handle the saving of the data.
		if(!this.saveUrl){
			this.emit("save", this.sections);
			return;
		}

		const headers = {};
		headers["Content-Type"] = "application/json";

		if(this.auth)
			headers["Authorization"] = typeof this.auth === "object" ? JSON.stringify(this.auth) : this.auth;

		const options = {
			method: "POST",
			json: true,
			body: JSON.stringify(sections),
			headers
		};

		const response = await fetch(this.saveUrl, options).catch( err => this._error(err));
		const statusMsg = { status: response.status, msg: response.statusText };
		this._removeLoading();

		if(!response.ok){
			if(response.status === 404)
				console.error("The provided save url doesn't seem to be an actual endpoint.");

			this._error({ ...statusMsg, success: false, type: "save" });
			return;
		}

		const result = await response.json();
		this._setSavedChanges(result.sections);
		this._setPublishStatus(result.sections);
		this.emit("save", { ...statusMsg, success: true });
	}

	/**
	 * Makes the saved changes public.
	 */
	async publish(){
		const hasChanged = this._changedSincePublish();

		if(!hasChanged) return;

		this._setLoading();
		const sections = this.sections.filter( section => {
			return section.original_text !== section.edited_text;
		});

		if(!this.publishUrl){
			this.emit("publish", sections);
			return;
		}

		const headers = {};
		headers["Content-Type"] = "application/json";

		if(this.auth)
			headers["Authorization"] = typeof this.auth === "object" ? JSON.stringify(this.auth) : this.auth;

		const options = {
			method: "POST",
			json: true,
			body: JSON.stringify(sections),
			headers
		};

		const response = await fetch(this.publishUrl, options).catch( err => this._error(err));
		const statusMsg = { status: response.status, msg: response.statusText };
		this._removeLoading();

		if(!response.ok){
			if(response.status === 404)
				console.error("The provided publish url doesn't seem to be an actual endpoint.");

			this._error({ ...statusMsg, success: false, type: "publish" });
			return;
		}

		const result = await response.json();
		this._setPublishedChanges(result.sections);
		this._setSavedChanges(result.sections);
		this.emit("publish", { ...statusMsg, success: true });
	}

	async _upload(file){
		this._setLoading();

		const data = new FormData();
		const headers = {};
		headers["Content-Type"] = "multitype/form-data";

		if(this.auth)
			headers["Authorization"] = typeof this.auth === "object" ? JSON.stringify(this.auth) : this.auth;

		data.append("file", file);
		const options = {
			method: "POST",
			body: file,
			headers
		};

		const response = await fetch(this.uploadUrl, options).catch( err => this._error(err));
		const statusMsg = { status: response.status, msg: response.statusText };
		this._removeLoading();

		if(!response.ok){
			if(response.status === 404)
				console.error("The provided file url doesn't seem to be an actual endpoint.");

			this._error({ ...statusMsg, success: false, type: "upload" });
			return null;
		}

		const result = await response.json();
		this.emit("upload", { ...statusMsg, success: true });
		return result.path;
	}

	_setLoading(){
		const html = document.querySelector("html");

		html.classList.add("loading");
	}

	_removeLoading(){
		const html = document.querySelector("html");

		html.classList.remove("loading");
	}

	/**
	 * Handle errors.
	 * @param {object} err - The error msg.
	 */
	_error(err){
		this.emit("error", err);
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
			const tagName = item.split(":")[0].split(".")[0].split("#")[0];

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

		document.addEventListener("mousedown", (e) => this._handleAbort(e), { once: true });
	}

	/**
	 * Check whether a change has been made since the last save.
	 */
	_changedSinceSave(){
		const sections = [...this.sections];
		let changed = false;

		for(let section of sections)
			if(section.saved_text !== section.edited_text)
				changed = true;

		return changed;
	}

	/**
	 * Set the current status of the save icon.
	 */
	_setSaveStatus(){
		const hasChanged = this._changedSinceSave();
		const saveIcon = this.toolbar.querySelector(".cms-save");
		const title = `${this.locale.shortcuts.save.name} (${this.locale.shortcuts.save.combo.join("+")})`;

		if(hasChanged){
			saveIcon.title = title + " - " + this.locale.hints.unsaved;
			saveIcon.setAttribute("disabled", "");
			saveIcon.classList.remove("inactive");
		}else {
			saveIcon.removeAttribute("disabled");
			saveIcon.title = title + " - " + this.locale.hints.saved;
			saveIcon.classList.add("inactive");
		}
	}

	/**
	 * Check if content has changed since last publish
	 */
	_changedSincePublish(){
		const sections = [...this.sections];
		let changed = false;

		for(let section of sections)
			if(section.original_text !== section.saved_text)
				changed = true;

		return changed;
	}

	_setPublishStatus(){
		const hasChanged = this._changedSincePublish();
		const saveIcon = this.toolbar.querySelector(".cms-publish");
		const title = `${this.locale.tooltips.publish}`;

		if(hasChanged){
			saveIcon.title = title + " - " + this.locale.hints.unpublished;
			saveIcon.setAttribute("disabled", "true");
			saveIcon.classList.remove("inactive");
		}else {
			saveIcon.removeAttribute("disabled");
			saveIcon.title = title + " - " + this.locale.hints.published;
			saveIcon.classList.add("inactive");
		}
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

		const grid = document.createElement("div");
		grid.classList.add("grid-container");

		const formatting = document.createElement("div");
		formatting.classList.add("cms-formatting");

		const insertion = document.createElement("div");
		insertion.classList.add("cms-insertion");

		const workflow = document.createElement("div");
		workflow.classList.add("cms-workflow");

		// Non-editing functions.
		const drag = this._createBtn({ name: "drag", handler: this._dragToolbar });
		const save = this._createBtn({ name: "save", handler: (e) => this.save(e) });
		const publish = this._createBtn({ name: "publish", handler: (e) => this.publish(e) });

		// Formatting functions.
		const bold = this._createBtn({ name: "bold", handler: this._makeBold });
		const italic = this._createBtn({ name: "italic", handler: this._makeItalic });
		const underline = this._createBtn({ name: "underline", handler: this._makeUnderline });
		const linethrough = this._createBtn({ name: "linethrough", handler: this._makeLinethrough });

		// Insertion buttons.
		const link = this._createBtn({ name: "link", handler: (e) => this._insertLink(e) });
		const image = this._createBtn({ name: "image", handler: (e) => this._insertImage(e) });

		grid.appendChild(drag);

		formatting.appendChild(bold);
		formatting.appendChild(italic);
		formatting.appendChild(underline);
		formatting.appendChild(linethrough);

		insertion.appendChild(link);
		insertion.appendChild(image);

		workflow.appendChild(save);
		workflow.appendChild(publish);

		grid.appendChild(formatting);
		grid.appendChild(insertion);
		grid.appendChild(workflow);
		toolbar.appendChild(grid);
		document.body.appendChild(toolbar);

		this.toolbar = toolbar;
	}

	_createBtn({ name, handler }){
		const title = this.locale.tooltips[name];
		const shortcut = this.locale.shortcuts[name];
		const combo = shortcut ? ` (${shortcut.combo.join("+")})` : "";

		const btn = document.createElement("button");
		btn.setAttribute("title", title + combo);
		btn.classList.add("cms-" + name);
		btn.classList.add("cms-btn");
		btn.addEventListener("mousedown", handler);

		return btn;
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
			this._removeInput();

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
	_updateChanges(path){
		const section = this._findSectionByPath(path);
		const value = document.querySelector(path).innerHTML;

		section.edited_text = value;
		this._setSaveStatus();
	}

	_setSavedChanges(sections){
		for(let section of sections){
			const content = section.content;
			const path = section.path;
			const localSection = this._findSectionByPath(path);

			localSection.saved_text = content;
			localSection.edited_text = content;
		}

		this._setSaveStatus();
	}

	_setPublishedChanges(sections){
		for(let section of sections){
			const content = section.content;
			const path = section.path;
			const localSection = this._findSectionByPath(path);

			localSection.saved_text = content;
			localSection.original_text = content;
		}

		this._setPublishStatus();
	}

	/**
	 * Confirm changes to a editable area.
	 * @param {object} e - An event object.
	 * @private
	 */
	_confirmChange(e){
		const target = document.querySelector(".cms-input-field");
		const path = getSelectorPath(target);

		this._updateChanges(path);
		this._removeInput();
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

	_removeInput(){
		const inputs = document.querySelectorAll(".cms-input-field");

		for(let input of inputs){
			input.removeAttribute("contenteditable");
			input.classList.remove("cms-input-field");
		}
	}

	_handleAbort(e){
		const target = e.target.localName !== "li" ? e.target : e.target.parentNode;
		const ctrl = e.ctrlKey;

		if(shouldAbort(target) && !ctrl)
			this._confirmChange();
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
		const filePath = this._upload(file);
		this.files.push(filePath);

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
	async _insertLink(e){
		e.preventDefault();
		e.stopImmediatePropagation();
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

	if(window.getSelection) {
		var sel = window.getSelection();
		if(sel.getRangeAt && sel.rangeCount)
			return sel.getRangeAt(0);
	}else if(document.selection && document.selection.createRange) {
		return document.selection.createRange();
	}
	return null;
}

function applySelection(range){
	if(range)
		if(window.getSelection) {
			var sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		}else if(document.selection && range.select) {
			range.select();
		}

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
		promptInput.focus();

		function cancelPrompt(e){
			const type = e.type;
			const key = e.key;

			if(type !== "click" && key !== "Escape") return;
			e.stopImmediatePropagation();
			e.preventDefault();

			document.body.removeChild(promptContainer);
			document.removeEventListener("keydown", cancelPrompt);
			resolve(false);
		}

		function submitPrompt(e, el){
			const target = el;
			const key = e.key ? e.key.toLowerCase() : null;
			const type = e.type;
			const tag = el.localName;
			let value = target.innerText;

			if(key !== "enter" && type !== "click") return;
			e.preventDefault();
			document.body.removeChild(promptContainer);

			if(tag === "input"){
				const file = el.files[0];
				const reader = new FileReader();

				reader.readAsDataURL(file);
				reader.onload = (theFile) => {
					const name = file.name;
					const url = theFile.target.result;

					resolve({ url, name, file });
				};

				// Return to avoid resolving twice.
				return;
			}

			resolve(value);
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

function getSelectorPath(el){
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

function getSelector(el){
	if(!el) return;

	let selector = el.localName;

	if(!selector) return;
	const classList = [...el.classList];
	const index = classList.indexOf("cms-input-field");

	if(index !== -1)
		classList.splice(index, 1);

	if(el.id)
		selector += "#" + el.id;
	else if(classList.length > 0)
		selector += "." + classList.join(".");

	return selector + " ";
}

function reverseStr(str, sep){
	const list = str.split(sep);
	const result = list.reverse().join(sep);

	return result;
}

function shouldAbort(target){
	const should = !target.classList.contains("cms-input-field") &&
					!target.classList.contains("cms-btn") &&
					!target.classList.contains("prompt-container") &&
					!target.classList.contains("prompt-input");

	return should;
}

export default CMS;
