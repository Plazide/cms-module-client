import "../css/toolbar.css";
import langs from "../locale.json";
import EventEmitter from "events";
import {
	getMetaInfo,
	getSelectorPath,
	navigateViaLink,
	getTopParent,
	appendTools,
	saveSelection,
	applySelection,
	promptUser,
	renderGhostPrompt,
	getShortcut,
	findSection,
	findChangedSections,
	setCookie,
	getCookie
} from "./lib/util";

/**
 * The CMS client class. It enables the WYSIWYG editor.
 */
class CMS extends EventEmitter{
	/**
	 * Create an instance of the CMS client.
	 * @param {object} [options] - An object containing options for the CMS class.
	 * @param {string} [options.lang] - The language that will be displayed in the editor.
	 * @param {string[]} [options.tags] - An array of html tags that should be editable. It takes the name of tags, such as "span" or "a", not specific html elements.
	 * @param {string} [options.saveUrl] - The endpoint where the client will send the edited content to be saved.
	 * @param {string} [options.publishUrl] - The endpoint where the client will send a request to make the saved content public.
	 * @param {string} [options.uploadUrl] - The endpoint where images will be sent.
	 * @param {function} [options.logout] - Add a logout function. If this is assigned a function, a logout button will appear on the main toolbar. If it is not specified, the logout button won't appear.
	 */
	constructor ({
		editorLang = "en",
		tags = [],
		saveUrl = "/cms/save",
		publishUrl = "/cms/publish",
		uploadUrl = "/cms/upload",
		editCanonical = false,
		auth = "",
		logout = null
	}){
		super();

		if(!Array.isArray(tags) && tags) throw new TypeError("tags is not an array");

		this.locale = langs[editorLang] || langs.en;
		this.tags = ["a", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol"].concat(tags);
		this.saveUrl = saveUrl;
		this.publishUrl = publishUrl;
		this.uploadUrl = uploadUrl;
		this.editCanonical = editCanonical;
		this.auth = auth;
		this.sections = [];
		this.childTags = ["li", "b", "i", "span", "u", "strike", "a"];
		this.logout = logout;
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

		this._handleShortcuts();
	}

	/*
	****************
	PUBLIC METHODS
	****************
	*/

	/**
	 * Start the CMS interface.
	 */
	run (){
		// Find all editable elements.
		const tags = this.tags.join(", ");
		const elements = [...document.querySelectorAll(tags)].reverse();

		// Add listeners to all the editable elements.
		for(const element of elements){
			const el = getTopParent(element, this.tags);

			const cmsElement = {
				original_text: el.innerHTML,
				edited_text: el.innerHTML,
				saved_text: el.innerHTML,
				element: el,
				path: getSelectorPath(el),
				page: window.location.pathname
			};
			this.sections.push(cmsElement);

			el.addEventListener("click", (e) => this._addEdit(e));
			el.classList.add("cms-editable");
		}

		this._renderToolbar();

		// Render the prompt, but make it hidden, to avoid recreating it every time it is needed.
		renderGhostPrompt(this.locale);

		window.addEventListener("mousedown", (e) => this._removeEdit(e));

		setInterval( () => { this.save(); }, 60 * 1000);
	}

	async save (){
		const hasChanged = this._changedSinceSave();

		if(!hasChanged) return;
		const changedSections = findChangedSections(this.sections);
		const meta = getMetaInfo();
		const data = {
			sections: changedSections,
			meta
		};

		console.log(data);

		document.body.style.cursor = "wait";
		const response = await fetch(this.saveUrl, {
			method: "POST",
			json: true,
			headers: {
				"Content-Type": "application/json"

			},
			body: JSON.stringify(data)
		});

		// When the request fails, show an error!
		if(!response.ok) this._error(this.locale.errors.save);

		// When the request succeeds, update the saved sections!
		if(response.ok) this._setSaved(changedSections);

		document.body.style.cursor = "auto";
	}

	async publish (){
		const hasChanged = this._changedSincePublish();

		if(!hasChanged) return;
		const sections = this.sections;

		document.body.style.cursor = "wait";
		const response = await fetch(this.publishUrl, {
			method: "POST",
			json: true,
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(sections)
		});

		// When the request fails, show an error!
		if(!response.ok) this._error(this.locale.errors.publish);

		// When the request succeeds, update sections!
		if(response.ok) this._setPublished();

		document.body.style.cursor = "auto";
	}

	/*
	****************
	PRIVATE METHODS
	****************
	*/

	/**
	 * Display an error.
	 * @param {string} msg - The error message.
	 * @private
	 */
	_error (msg){
		console.error(msg);
	}

	/**
	 * Set the status of the publish icon. Disabled or not disabled.
	 * @private
	 */
	_setPublishStatus (){

		/* const hasChanged = this._changedSincePublish();
		const button = document.querySelector(".cms-publish");

		if(!hasChanged)
			button.setAttribute("disabled", "true");
		else if(hasChanged)
			button.removeAttribute("disabled"); */
	}

	/**
	 * Check whether there have been changes since the last publish.
	 * @private
	 */
	_changedSincePublish (){
		return true;

		/* const sections = this.sections;

		for(let section of sections)
			if(section.saved_text !== section.original_text)
				return true;

		return false; */
	}

	/**
	 * Set the content that was just published as the original text.
	 * @private
	 */
	_setPublished (){
		const sections = this.sections;

		for(let section of sections)
			section.original_text = section.saved_text;

		this._setPublishStatus();
	}

	/**
	 * Sets the status of the save button, whether it is disabled or not.
	 * @private
	 */
	_setSaveStatus (){
		const hasChanged = this._changedSinceSave();
		const saveButton = document.querySelector(".cms-save");

		if(!hasChanged)
			saveButton.setAttribute("disabled", "true");
		else if(hasChanged)
			saveButton.removeAttribute("disabled");
	}

	/**
	 * Checks whether or not changes have been made since the last save.
	 * @returns {boolean} - True means that changes have been made. False means no changes have been made.
	 * @private
	 */
	_changedSinceSave (){
		return true;

		/* const sections = this.sections;

		for(let section of sections)
			if(section.edited_text !== section.saved_text)
				return true;

		return false; */
	}

	/**
	 * Set the saved content.
	 * @param {object[]} changedSections - And array of sections that have changed.
	 * @private
	 */
	_setSaved (changedSections){
		const sections = this.sections;

		for(let section of sections){
			const element = section.element;

			changedSections.forEach( changedSection => {
				if(changedSection.element === element)
					section.saved_text = changedSection.edited_text;
			});
		}

		this._setSaveStatus();
		this._setPublishStatus();
	}

	/**
	 * Sets the edited content in a section.
	 * @param {string} element - An editable element
	 * @private
	 */
	_setEdits (element){
		const content = element.innerHTML;
		const section = findSection(element, this.sections);

		section.edited_text = content;
		this._setSaveStatus();
	}

	/**
	 * Handle all shortcuts.
	 * @private
	 */
	_handleShortcuts (){
		document.onkeydown = (e) => {
			const combo = [];
			const ctrl = e.ctrlKey;
			const shift = e.shiftKey;
			const alt = e.altKey;
			const key = e.key.toLowerCase();
			const isInputContext = e.target.classList.contains("cms-editable");

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
		};
	}

	_editMeta (){
		const metaInfo = getMetaInfo();
		const container = document.createElement("div");
		const content = document.createElement("form");
		const inputs = document.createElement("div");
		const header = document.createElement("header");
		const title = document.createElement("span");
		const close = document.createElement("div");
		const submit = document.createElement("button");

		const editTitle = this._createInput({
			label: this.locale.meta.pageTitle,
			name: "title",
			defaultValue: metaInfo.title
		});
		const editDesc = this._createInput({
			label: this.locale.meta.pageDesc,
			name: "description",
			defaultValue: metaInfo.description
		});
		const editKeywords = this._createInput({
			label: this.locale.meta.pageKeywords,
			name: "keywords",
			defaultValue: metaInfo.keywords
		});
		const editCanonical = this._createInput({
			label: this.locale.meta.pageCanonical,
			name: "canonical",
			defaultValue: metaInfo.canonical
		});

		container.classList.add("meta");
		submit.textContent = this.locale.meta.submit;

		inputs.classList.add("inputs");
		close.classList.add("close");
		title.classList.add("title");
		title.textContent = this.locale.meta.title;
		header.appendChild(title);
		header.appendChild(close);

		inputs.appendChild(editTitle);
		inputs.appendChild(editDesc);
		inputs.appendChild(editKeywords);

		if(this.editCanonical)
			inputs.appendChild(editCanonical);

		inputs.appendChild(submit);

		content.classList.add("content");
		content.appendChild(header);
		content.appendChild(inputs);
		container.appendChild(content);
		document.body.prepend(container);

		function closeEdit (e){
			const{ key, type } = e;

			if(key === "Escape" || type === "click"){
				window.removeEventListener("keyup", closeEdit);
				document.body.removeChild(container);
			}
		}

		const onSubmit = (e) => {
			e.preventDefault();

			const form = {};
			const inputs = [...e.target];
			inputs.forEach( input => { form[input.name] = input.value; });
			this._setMeta(form);
		};

		content.addEventListener("submit", onSubmit);
		close.addEventListener("click", closeEdit);
		window.addEventListener("keyup", closeEdit);
	}

	_setMeta ({ title, description, keywords, canonical }){
		if(title)
			document.title = title;

		if(description)
			document.querySelector("head meta[name=\"description\"]").setAttribute("content", description);

		if(keywords)
			document.querySelector("head meta[name=\"keywords\"]").setAttribute("content", keywords);

		if(canonical)
			document.querySelector("head link[rel=\"canonical\"]").setAttribute("href", canonical);

		this.save();
	}

	_createInput ({ defaultValue = "", name = "", label = "", classes = "" }){
		const input = document.createElement("input");
		const inputCon = document.createElement("div");
		const inputLabel = document.createElement("span");
		input.className = classes;
		input.name = name;
		input.value = defaultValue;
		inputLabel.textContent = label;

		inputCon.classList.add("input-container");

		inputCon.appendChild(inputLabel);
		inputCon.appendChild(input);

		return inputCon;
	}

	/**
	 * Render the global toolbar.
	 * @private
	 */
	_renderToolbar (){
		const body = document.body;
		const toolbar = document.createElement("div");
		const publish = this._createBtn({ name: "publish", handler: () => this.publish() });
		const save = this._createBtn({ name: "save", handler: () => this.save() });
		const meta = this._createBtn({ name: "meta", handler: () => this._editMeta() });
		/* const langs = this._createDropdown({
			name: "langs",
			options: [
				{
					name: "Svenska",
					value: "sv"
				},
				{
					name: "English",
					value: "en"
				},
				{
					name: "Nederlands",
					value: "nl"
				}
			],
			handler: (e) => this._changeLanguage(e)
		}); */
		const logout = typeof this.logout === "function"
			? this._createBtn({ name: "logout", handler: this.logout }) : null;

		// The order of this array determines the order in which the tools are displayed.
		const tools = [logout, meta, save, publish];

		body.classList.add("cms-active");
		toolbar.classList.add("cms-toolbar");

		appendTools(tools, toolbar);
		body.appendChild(toolbar);

		this._setSaveStatus();
		this._setPublishStatus();
	}

	/**
	 * Add a local toolbar to an HTMLElement.
	 * @param {HTMLElement} el - The HTMLElement to a toolbar to.
	 * @private
	 */
	_addLocalToolbar (el){
		const body = document.body;
		const tbHeight = 40;
		const tbWidth = 200;

		const toolbar = document.createElement("div");
		toolbar.classList.add("local-toolbar");

		function setPosition (){
			const elHeight = el.getBoundingClientRect().height;
			let elPosY = el.getBoundingClientRect().top - body.getBoundingClientRect().top + elHeight + 10,
				elPosX = el.getBoundingClientRect().left;

			// If the toolbar exceeds the width or height of the page,
			// move it so that the whole toolbar can be displayed.
			const tbViewPos = (el.offsetTop + elHeight + 80);
			const view = window.innerHeight;
			if(elPosX + tbWidth > window.innerWidth)
				elPosX = (window.innerWidth - tbWidth) - 5;

			if(tbViewPos > view)
				elPosY = el.offsetTop - tbHeight - 10;

			toolbar.style.setProperty("top", elPosY + "px");
			toolbar.style.setProperty("left", elPosX + "px");
			toolbar.style.setProperty("height", tbHeight + "px");
			toolbar.style.setProperty("width", tbWidth + "px");
		}
		setPosition();

		this._addTools(toolbar);

		// Only add a local toolbar if another one does not exist.
		if(!document.querySelector(".local-toolbar"))
			body.appendChild(toolbar);

		el.addEventListener("input", setPosition);

		return toolbar;
	}

	/**
	 * Add buttons to a local toolbar.
	 * @param {HTMLElement} toolbar - The toolbar to add buttons to.
	 * @private
	 */
	_addTools (toolbar){
		const bold = this._createBtn({ name: "bold", handler: this._makeBold });
		const italic = this._createBtn({ name: "italic", handler: this._makeItalic });
		const underline = this._createBtn({ name: "underline", handler: this._makeUnderline });
		const linethrough = this._createBtn({ name: "linethrough", handler: this._makeLinethrough });
		const link = this._createBtn({ name: "link", handler: (e) => this._insertLink(e) });
		const unlink = this._createBtn({ name: "unlink", handler: this._unlink });

		const tools = [bold, italic, underline, linethrough, link, unlink];

		appendTools(tools, toolbar);
	}

	/**
	 * Adds a local toolbar and highlighting around an element.
	 * @param {Event} e - An event object
	 * @private
	 */
	_addEdit (e){
		const el = getTopParent(e.target, this.tags) || e.target;
		const ctrl = e.ctrlKey;

		if(ctrl && el.localName === "a")
			navigateViaLink(el);

		el.setAttribute("contenteditable", true);
		el.focus();
		el.classList.add("outline");

		this._addLocalToolbar(el);
	}

	/**
	 * Removes the local toolbar and highlighting around an element
	 * @param {Event} e - An event object
	 * @private
	 */
	_removeEdit (e){
		const target = e.target;
		const el = document.querySelector(".cms-editable[contenteditable=true]");
		const localToolbar = document.querySelector(".local-toolbar");

		if(
			target === localToolbar ||
			target.classList.contains("cms-btn") ||
			target === el ||
			document.querySelector(".cms-prompt-container.show")
		) return false;

		// Remove the localToolbar, but only if one exists.
		if(document.querySelector(".local-toolbar"))
			document.body.removeChild(localToolbar);

		// Remove editable attribute and highlighting.
		if(el){
			el.removeAttribute("contenteditable");
			el.classList.remove("outline");
		}

		// Set save edited content.
		if(el)
			// const path = getSelectorPath(el);
			this._setEdits(el);
	}

	/**
	 * Create a button.
	 * @param {object} options - Options to pass to create the button.
	 * @param {string} options.name - The name of the button, should correspond to a name in the locale file.
	 * @param {function} options.handler - The functions that fires when the button is pressed.
	 * @returns {HTMLElement}
	 * @private
	 */
	_createBtn ({ name, handler }){
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
	 * Create a dropdown menu.
	 * @param {object} options - Options used to create the dropdown.
	 * @param {String} options.name - The name of the dropdown, should correspond to a name in the locale file.
	 * @param {function} options.handler - A function that will be called when the dropdown value changes.
	 * @param {object[]} options.options - An array of options to choose from in the dropdown.
	 * @param {string} options.options.name - The name of the option, this is the value that is displayed when choosing an option.
	 * @param {string} options.options.value - The value of the option.
	 * @returns {HTMLDivElement}
	 * @private
	 */
	_createDropdown ({ name, handler, options }){
		const title = this.locale.tooltips[name];
		const con = document.createElement("div");
		const icon = document.createElement("label");
		const dropdown = document.createElement("select");
		const currentLang = getCookie("lang");

		con.classList.add("change-lang-con");
		con.setAttribute("title", title);
		icon.classList.add("cms-langs");
		icon.classList.add("cms-btn");
		icon.setAttribute("for", "cms-lang");
		dropdown.setAttribute("id", "cms-lang");

		options.forEach( option => {
			const opt = document.createElement("option");

			if(option.value === currentLang)
				opt.setAttribute("selected", "");

			opt.innerText = option.name;
			opt.value = option.value;

			dropdown.appendChild(opt);
		});

		con.appendChild(icon);
		con.appendChild(dropdown);
		dropdown.addEventListener("change", handler);

		return con;
	}

	/**
	 * Change the language that is being edited.
	 * @param {Event} e - An event object.
	 * @private
	 */
	_changeLanguage (e){
		const target = e.target;
		const value = target.value;

		setCookie("lang", value);
		window.location.reload();
	}

	/**
	 * Make the selected text bold.
	 * @private
	 */
	_makeBold (){
		document.execCommand("bold");
	}

	/**
	 * Make the selected text italic.
	 * @private
	 */
	_makeItalic (){
		document.execCommand("italic");
	}

	/**
	 * Make the selected text underlined.
	 * @private
	 */
	_makeUnderline (){
		document.execCommand("underline");
	}

	/**
	 * Make the selected text have a line through it.
	 * @private
	 */
	_makeLinethrough (){
		document.execCommand("strikeThrough");
	}

	/**
	 * Remove anchor tag from selected text.
	 * @private
	 */
	_unlink (){
		document.execCommand("unlink");
	}

	/**
	 * Make the selected text into a link.
	 * @param {Event} e - An event object from clicking the insert link button.
	 * @private
	 */
	async _insertLink (e){
		e.preventDefault();
		e.stopImmediatePropagation();
		const titleText = this.locale.prompt.link;
		const cmdText = "createLink";
		const type = "link";

		const savedSelection = saveSelection();
		if(!savedSelection) return;

		const link = await promptUser(titleText, type);
		applySelection(savedSelection);

		if(link)
			document.execCommand(cmdText, false, link);
	}
}

export default CMS;
